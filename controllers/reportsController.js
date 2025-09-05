const Order = require('../models/Order');
const { isValidObjectId } = require('mongoose');

// Build Mongo match query based on filters, respecting warehouse access injected by middleware
function buildMatchQuery(req) {
  const {
    startDate,
    endDate,
    warehouseId,
    status,
    paymentMethod,
    categoryId,
    brandId,
    minTotal,
    maxTotal,
  } = req.query;

  const match = {};

  // Date range
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) {
      const d = new Date(endDate);
      // include the end day fully
      d.setHours(23, 59, 59, 999);
      match.createdAt.$lte = d;
    }
  }

  // Warehouse filtering:
  // 1) For restricted roles, middleware sets req.assignedWarehouseIds (array of ObjectIds)
  // 2) Optional explicit filter by a specific warehouseId
  const assignedWarehouseIds = Array.isArray(req.assignedWarehouseIds) ? req.assignedWarehouseIds.map(String) : [];
  if (assignedWarehouseIds.length) {
    match['warehouseInfo.warehouseId'] = { $in: assignedWarehouseIds };
  }
  if (warehouseId && warehouseId !== 'all') {
    match['warehouseInfo.warehouseId'] = warehouseId;
  }

  if (status && status !== 'all') {
    match.status = status;
  }

  if (paymentMethod && paymentMethod !== 'all') {
    match['paymentInfo.method'] = paymentMethod;
  }

  // Category/Brand filter at item level; apply using $elemMatch
  const itemElem = {};
  if (categoryId && isValidObjectId(categoryId)) {
    itemElem.categoryId = require('mongoose').Types.ObjectId.createFromHexString(categoryId);
  }
  if (brandId && isValidObjectId(brandId)) {
    itemElem.brandId = require('mongoose').Types.ObjectId.createFromHexString(brandId);
  }
  if (Object.keys(itemElem).length) {
    match.items = { $elemMatch: itemElem };
  }

  // Totals
  if (minTotal || maxTotal) {
    match['pricing.total'] = {};
    if (minTotal) match['pricing.total'].$gte = Number(minTotal);
    if (maxTotal) match['pricing.total'].$lte = Number(maxTotal);
  }

  return match;
}

exports.getSummary = async (req, res) => {
  try {
    const match = buildMatchQuery(req);
    const interval = (req.query.interval || 'daily').toString();

    // Determine bucket label based on interval
    const buildLabelProjection = () => {
      if (interval === 'yearly') {
        return { $dateToString: { format: '%Y', date: '$createdAt' } };
      }
      if (interval === 'quarterly') {
        return {
          $concat: [
            { $dateToString: { format: '%Y', date: '$createdAt' } },
            '-Q',
            {
              $toString: {
                $ceil: { $divide: [{ $month: '$createdAt' }, 3] }
              }
            }
          ]
        };
      }
      if (interval === 'monthly') {
        return { $dateToString: { format: '%Y-%m', date: '$createdAt' } };
      }
      if (interval === 'weekly') {
        return {
          $concat: [
            { $dateToString: { format: '%G', date: '$createdAt' } }, // ISO week-year
            '-W',
            { $toString: { $isoWeek: '$createdAt' } }
          ]
        };
      }
      // daily (default)
      return { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
    };
    const labelExpr = buildLabelProjection();

    // Compute growth vs previous period
    const now = new Date();
    let rangeStart = null;
    let rangeEnd = null;
    if (req.query.startDate || req.query.endDate) {
      rangeStart = req.query.startDate ? new Date(req.query.startDate) : null;
      rangeEnd = req.query.endDate ? new Date(req.query.endDate) : now;
      if (rangeEnd) { rangeEnd.setHours(23,59,59,999); }
    } else {
      // Default range: last 30 days
      rangeEnd = now;
      rangeStart = new Date();
      rangeStart.setDate(rangeStart.getDate() - 29);
      rangeStart.setHours(0,0,0,0);
    }
    const msInDay = 24*60*60*1000;
    const durationMs = Math.max(msInDay, (rangeEnd?.getTime() || now.getTime()) - (rangeStart?.getTime() || now.getTime()));
    const prevEnd = new Date((rangeStart?.getTime() || now.getTime()) - 1);
    const prevStart = new Date(prevEnd.getTime() - durationMs + 1);

    const currentPeriodMatch = { ...match };
    currentPeriodMatch.createdAt = { $gte: rangeStart, $lte: rangeEnd };
    const prevPeriodMatch = { ...match };
    prevPeriodMatch.createdAt = { $gte: prevStart, $lte: prevEnd };

    const [cardsAgg, revenueByDay, ordersByDay, topCategories, returnsAgg, prevRevenueAgg] = await Promise.all([
      Order.aggregate([
        { $match: currentPeriodMatch },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: '$pricing.total' },
            avgOrderValue: { $avg: '$pricing.total' },
          },
        },
      ]),
      // revenue by selected period
      Order.aggregate([
        { $match: currentPeriodMatch },
        { $group: { _id: labelExpr, total: { $sum: '$pricing.total' } } },
        { $sort: { _id: 1 } },
      ]),
      // orders by selected period
      Order.aggregate([
        { $match: currentPeriodMatch },
        { $group: { _id: labelExpr, total: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      // top categories by revenue (robust id/name handling)
      Order.aggregate([
        { $match: currentPeriodMatch },
        { $unwind: '$items' },
        // Prepare possible identifiers and names
        { $addFields: {
          catIdFromItems: { $convert: { input: '$items.categoryId', to: 'objectId', onError: null, onNull: null } },
          // If items.category appears to be a 24-hex string, also treat it as an id
          catIdFromNameLikeId: { $convert: { input: { $cond: [ { $regexMatch: { input: '$items.category', regex: /^[a-f0-9]{24}$/ } }, '$items.category', null ] }, to: 'objectId', onError: null, onNull: null } },
          nameFromItem: '$items.category'
        }},
        { $addFields: {
          effectiveCatId: { $ifNull: ['$catIdFromItems', '$catIdFromNameLikeId'] }
        }},
        { $group: {
          _id: { $ifNull: ['$effectiveCatId', '$nameFromItem'] },
          effectiveCatId: { $first: '$effectiveCatId' },
          nameFromItem: { $first: '$nameFromItem' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
        }},
        // Lookup by id if we have one
        { $lookup: { from: 'categories', localField: 'effectiveCatId', foreignField: '_id', as: 'cat' } },
        { $addFields: {
          // Prefer category.name from lookup; else if nameFromItem is NOT an id-like string, use it; otherwise Unknown
          name: {
            $ifNull: [
              { $arrayElemAt: ['$cat.name', 0] },
              { $cond: [ { $regexMatch: { input: { $ifNull: ['$nameFromItem', ''] }, regex: /^[a-f0-9]{24}$/ } }, null, '$nameFromItem' ] },
              'Unknown'
            ]
          }
        }},
        { $project: { _id: 0, name: 1, revenue: 1 } },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
      ]),
      // returns (orders with refunded status)
      Order.aggregate([
        { $match: { ...currentPeriodMatch, status: 'refunded' } },
        { $group: { _id: null, count: { $sum: 1 } } }
      ]),
      // Previous period revenue total
      Order.aggregate([
        { $match: prevPeriodMatch },
        { $group: { _id: null, total: { $sum: '$pricing.total' } } }
      ])
    ]);

    const cards = cardsAgg[0] || { totalOrders: 0, totalRevenue: 0, avgOrderValue: 0 };
    const returnOrders = returnsAgg[0]?.count || 0;
    const prevRevenue = prevRevenueAgg[0]?.total || 0;
    const growthPct = prevRevenue > 0 ? ((cards.totalRevenue - prevRevenue) / prevRevenue) * 100 : (cards.totalRevenue > 0 ? 100 : 0);
    res.json({ cards: { ...cards, returnOrders, growthPct }, revenueByDay, ordersByDay, topCategories, interval });
  } catch (err) {
    console.error('getSummary error', err);
    res.status(500).json({ error: 'Failed to load report summary' });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const match = buildMatchQuery(req);
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.find(match)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('orderId invoiceNumber customerInfo pricing status createdAt warehouseInfo paymentInfo items taxCalculation')
        .populate('items.categoryId', 'name')
        .populate('items.brandId', 'name'),
      Order.countDocuments(match),
    ]);

    res.json({ page, limit, total, orders });
  } catch (err) {
    console.error('getOrders error', err);
    res.status(500).json({ error: 'Failed to load orders' });
  }
};

// Helpers for exports
function toCsvRow(values) {
  return values
    .map((v) => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      if (s.search(/[",\n]/g) >= 0) return '"' + s + '"';
      return s;
    })
    .join(',');
}

exports.exportCsv = async (req, res) => {
  try {
    const match = buildMatchQuery(req);
    const orders = await Order.find(match)
      .sort({ createdAt: -1 })
      .select('orderId invoiceNumber customerInfo pricing status createdAt warehouseInfo paymentInfo items');

    const header = [
      'InvoiceID',
      'Date',
      'Warehouse',
      'Customer',
      'Phone',
      'PaymentMethod',
      'Status',
      'Subtotal',
      'Tax',
      'Discount',
      'DeliveryCharge',
      'Total',
      'Items',
    ];
    const rows = orders.map((o) =>
      toCsvRow([
        o.invoiceNumber || o.orderId,
        o.createdAt?.toISOString(),
        o.warehouseInfo?.warehouseName || '',
        o.customerInfo?.name || '',
        o.customerInfo?.phone || '',
        o.paymentInfo?.method || '',
        o.status,
        o.pricing?.subtotal ?? '',
        o.pricing?.taxAmount ?? '',
        o.pricing?.discountAmount ?? '',
        o.pricing?.deliveryCharge ?? '',
        o.pricing?.total ?? '',
        (o.items || [])
          .map((it) => `${it.name} x${it.quantity} @ ${it.price}`)
          .join(' | '),
      ])
    );

    const csv = [toCsvRow(header), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="reports.csv"');
    res.send(csv);
  } catch (err) {
    console.error('exportCsv error', err);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
};

// Minimal Tally XML for Sales vouchers
function buildTallyXml(orders) {
  const vouchers = orders
    .map((o) => {
      const date = new Date(o.createdAt);
      const tallyDate = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
      const ledgerName = (o.paymentInfo?.method === 'cod') ? 'Cash' : 'Bank';
      const partyName = o.customerInfo?.name || 'Customer';
      const amount = Number(o.pricing?.total || 0).toFixed(2);
      return `
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Sales" ACTION="Create">
            <DATE>${tallyDate}</DATE>
            <VOUCHERNUMBER>${o.invoiceNumber || o.orderId}</VOUCHERNUMBER>
            <PARTYNAME>${partyName}</PARTYNAME>
            <REFERENCE>${o.invoiceNumber || o.orderId}</REFERENCE>
            <NARRATION>Warehouse: ${o.warehouseInfo?.warehouseName || ''}</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${ledgerName}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${amount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Sales</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMPOSITIVE>
              <AMOUNT>${amount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>`;
    })
    .join('');

  return `<?xml version="1.0"?>
  <ENVELOPE>
    <HEADER>
      <TALLYREQUEST>Import Data</TALLYREQUEST>
    </HEADER>
    <BODY>
      <IMPORTDATA>
        <REQUESTDESC>
          <REPORTNAME>Vouchers</REPORTNAME>
          <STATICVARIABLES>
            <SVCURRENTCOMPANY>Company</SVCURRENTCOMPANY>
          </STATICVARIABLES>
        </REQUESTDESC>
        <REQUESTDATA>
          ${vouchers}
        </REQUESTDATA>
      </IMPORTDATA>
    </BODY>
  </ENVELOPE>`;
}

exports.exportTallyXml = async (req, res) => {
  try {
    const match = buildMatchQuery(req);
    const orders = await Order.find(match)
      .sort({ createdAt: -1 })
      .select('orderId invoiceNumber customerInfo pricing createdAt warehouseInfo paymentInfo');

    const xml = buildTallyXml(orders);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', 'attachment; filename="tally.xml"');
    res.send(xml);
  } catch (err) {
    console.error('exportTallyXml error', err);
    res.status(500).json({ error: 'Failed to export Tally XML' });
  }
};


