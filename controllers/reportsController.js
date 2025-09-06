const Order = require('../models/Order');
const Return = require('../models/Return');
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

// Helper function to extract state from address (same as ReturnDetailsModal)
function extractStateFromAddress(address) {
  if (!address) return '';
  
  // Common state patterns in Indian addresses
  const statePatterns = [
    /\b(Andhra Pradesh|AP)\b/i,
    /\b(Arunachal Pradesh|AR)\b/i,
    /\b(Assam|AS)\b/i,
    /\b(Bihar|BR)\b/i,
    /\b(Chhattisgarh|CG)\b/i,
    /\b(Goa|GA)\b/i,
    /\b(Gujarat|GJ)\b/i,
    /\b(Haryana|HR)\b/i,
    /\b(Himachal Pradesh|HP)\b/i,
    /\b(Jharkhand|JH)\b/i,
    /\b(Karnataka|KA)\b/i,
    /\b(Kerala|KL)\b/i,
    /\b(Madhya Pradesh|MP)\b/i,
    /\b(Maharashtra|MH)\b/i,
    /\b(Manipur|MN)\b/i,
    /\b(Meghalaya|ML)\b/i,
    /\b(Mizoram|MZ)\b/i,
    /\b(Nagaland|NL)\b/i,
    /\b(Odisha|OR)\b/i,
    /\b(Punjab|PB)\b/i,
    /\b(Rajasthan|RJ)\b/i,
    /\b(Sikkim|SK)\b/i,
    /\b(Tamil Nadu|TN)\b/i,
    /\b(Telangana|TS)\b/i,
    /\b(Tripura|TR)\b/i,
    /\b(Uttar Pradesh|UP)\b/i,
    /\b(Uttarakhand|UK)\b/i,
    /\b(West Bengal|WB)\b/i,
    /\b(Delhi|DL)\b/i,
    /\b(Jammu and Kashmir|JK)\b/i,
    /\b(Ladakh|LA)\b/i,
    /\b(Chandigarh|CH)\b/i,
    /\b(Puducherry|PY)\b/i,
    /\b(Andaman and Nicobar Islands|AN)\b/i,
    /\b(Dadra and Nagar Haveli and Daman and Diu|DN)\b/i,
    /\b(Lakshadweep|LD)\b/i
  ];
  
  for (const pattern of statePatterns) {
    const match = address.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }
  
  return '';
}

// Helper function to determine if order is interstate or intrastate (same logic as ReturnDetailsModal)
function isInterstateOrder(order) {
  if (!order || !order.deliveryInfo || !order.warehouseInfo) {
    return false; // Default to intrastate if data is missing
  }
  
  // Get customer and warehouse states for interstate determination
  const customerState = order.deliveryInfo.address?.state || '';
  const warehouseState = order.warehouseInfo.warehouseId?.address ? 
    extractStateFromAddress(order.warehouseInfo.warehouseId.address) : 
    (order.warehouseInfo.warehouseId?.state || '');
  
  // Determine if this is interstate delivery
  // Also check if the order details already have interstate information
  const isInterState = !!(customerState && warehouseState &&
    customerState.toLowerCase().trim() !== warehouseState.toLowerCase().trim()) ||
    order?.taxCalculation?.isInterState === true;
  
  return isInterState;
}

// Helper function to calculate taxes based on interstate/intrastate (same logic as ReturnDetailsModal)
function calculateReturnTaxes(returnDoc) {
  const order = returnDoc.orderObjectId;
  const isInterstate = isInterstateOrder(order);
  
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  
  if (returnDoc.items && returnDoc.items.length > 0) {
    // Calculate tax for each item using the same logic as ReturnDetailsModal
    returnDoc.items.forEach(item => {
      const itemTax = item.tax?.percentage || 0;
      const priceIncludesTax = item.priceIncludesTax || false;
      const totalPrice = item.price * item.quantity;
      
      let basePrice;
      let taxAmount;
      
      if (priceIncludesTax) {
        // Price is inclusive of tax - calculate base price from total price
        basePrice = totalPrice / (1 + itemTax / 100);
        taxAmount = totalPrice - basePrice;
      } else {
        // Price is exclusive of tax - calculate tax amount from base price
        basePrice = totalPrice;
        taxAmount = basePrice * (itemTax / 100);
      }
      
      if (isInterstate) {
        // Interstate: Only IGST applies
        igst += taxAmount;
      } else {
        // Intrastate: CGST and SGST apply (each is half of total tax)
        cgst += (taxAmount / 2);
        sgst += (taxAmount / 2);
      }
    });
  }
  
  return { cgst, sgst, igst, isInterstate };
}

// Build match query for returns
function buildReturnMatchQuery(req) {
  const {
    startDate,
    endDate,
    warehouseId,
    status,
  } = req.query;

  const match = {};

  // Date range
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) {
      const d = new Date(endDate);
      d.setHours(23, 59, 59, 999);
      match.createdAt.$lte = d;
    }
  }

  // Warehouse filtering
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

  return match;
}

// Get return summary
exports.getReturnSummary = async (req, res) => {
  try {
    const match = buildReturnMatchQuery(req);
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
            { $dateToString: { format: '%G', date: '$createdAt' } },
            '-W',
            { $toString: { $isoWeek: '$createdAt' } }
          ]
        };
      }
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

    const [cardsAgg, returnsByDay, topReturnCategories, prevReturnsAgg] = await Promise.all([
      Return.aggregate([
        { $match: currentPeriodMatch },
        {
          $group: {
            _id: null,
            totalReturns: { $sum: 1 },
            totalReturnValue: { $sum: '$refundedAmount' },
            avgReturnValue: { $avg: '$refundedAmount' },
            pendingReturns: { $sum: { $cond: [{ $eq: ['$status', 'requested'] }, 1, 0] } }
          },
        },
      ]),
      // returns by selected period
      Return.aggregate([
        { $match: currentPeriodMatch },
        { $group: { _id: labelExpr, total: { $sum: '$refundedAmount' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      // top return categories by value
      Return.aggregate([
        { $match: currentPeriodMatch },
        { $unwind: '$items' },
        { $addFields: {
          catIdFromItems: { $convert: { input: '$items.category', to: 'objectId', onError: null, onNull: null } },
          nameFromItem: '$items.category'
        }},
        { $lookup: { from: 'categories', localField: 'catIdFromItems', foreignField: '_id', as: 'cat' } },
        { $addFields: {
          categoryName: {
            $ifNull: [
              { $arrayElemAt: ['$cat.name', 0] },
              { $cond: [ 
                { $regexMatch: { input: { $ifNull: ['$nameFromItem', ''] }, regex: /^[a-f0-9]{24}$/ } }, 
                'Unknown Category', 
                '$nameFromItem' 
              ] }
            ]
          }
        }},
        { $group: {
          _id: '$categoryName',
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
        }},
        { $project: { _id: 0, name: '$_id', revenue: 1 } },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
      ]),
      // Previous period returns total
      Return.aggregate([
        { $match: prevPeriodMatch },
        { $group: { _id: null, total: { $sum: '$refundedAmount' } } }
      ])
    ]);

    const cards = cardsAgg[0] || { totalReturns: 0, totalReturnValue: 0, avgReturnValue: 0, pendingReturns: 0 };
    const prevReturns = prevReturnsAgg[0]?.total || 0;
    const growthPct = prevReturns > 0 ? ((cards.totalReturnValue - prevReturns) / prevReturns) * 100 : (cards.totalReturnValue > 0 ? 100 : 0);
    
    res.json({ 
      cards: { ...cards, growthPct }, 
      returnsByDay, 
      topReturnCategories, 
      interval 
    });
  } catch (err) {
    console.error('getReturnSummary error', err);
    res.status(500).json({ error: 'Failed to load return summary' });
  }
};

// Get returns list
exports.getReturns = async (req, res) => {
  try {
    const match = buildReturnMatchQuery(req);
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const skip = (page - 1) * limit;

    const [returns, total] = await Promise.all([
      Return.find(match)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('returnId customerInfo status createdAt warehouseInfo refundedAmount returnValue items orderId orderObjectId')
        .populate('userId', 'name email phone')
        .populate({
          path: 'orderObjectId',
          select: 'orderId invoiceNumber deliveryInfo taxCalculation',
          populate: {
            path: 'warehouseInfo.warehouseId',
            select: 'address state'
          }
        }),
      Return.countDocuments(match),
    ]);

    res.json({ page, limit, total, returns });
  } catch (err) {
    console.error('getReturns error', err);
    res.status(500).json({ error: 'Failed to load returns' });
  }
};

// Export returns CSV
exports.exportReturnsCsv = async (req, res) => {
  try {
    const match = buildReturnMatchQuery(req);
    const returns = await Return.find(match)
      .sort({ createdAt: -1 })
      .select('returnId customerInfo status createdAt warehouseInfo refundedAmount returnValue items orderId orderObjectId')
      .populate('orderObjectId', 'orderId invoiceNumber');

    const header = [
      'Invoice ID',
      'Return ID',
      'Date',
      'Customer',
      'Phone',
      'Items',
      'Status',
      'Warehouse',
      'CGST',
      'SGST',
      'IGST',
      'Refund Amount',
    ];
    const rows = returns.map((r) => {
      // Calculate tax amounts based on interstate/intrastate
      const { cgst, sgst, igst } = calculateReturnTaxes(r);

      // Format items information
      const itemsText = r.items && r.items.length > 0 
        ? `${r.items.length} item${r.items.length !== 1 ? 's' : ''}: ${r.items.slice(0, 2).map(item => item.name).join(', ')}${r.items.length > 2 ? '...' : ''}`
        : 'No items';

      return toCsvRow([
        r.orderObjectId?.invoiceNumber || r.orderObjectId?.orderId || r.orderId || '',
        r.returnId,
        r.createdAt?.toISOString() || '',
        r.customerInfo?.name || '',
        r.customerInfo?.phone || '',
        itemsText,
        r.status,
        r.warehouseInfo?.warehouseName || '',
        cgst > 0 ? cgst.toFixed(2) : '',
        sgst > 0 ? sgst.toFixed(2) : '',
        igst > 0 ? igst.toFixed(2) : '',
        r.refundedAmount || 0,
      ]);
    });

    const csv = [toCsvRow(header), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="returns-reports.csv"');
    res.send(csv);
  } catch (err) {
    console.error('exportReturnsCsv error', err);
    res.status(500).json({ error: 'Failed to export returns CSV' });
  }
};

// Export returns Tally XML
exports.exportReturnsTallyXml = async (req, res) => {
  try {
    const match = buildReturnMatchQuery(req);
    const returns = await Return.find(match)
      .sort({ createdAt: -1 })
      .select('returnId customerInfo status createdAt warehouseInfo refundedAmount returnValue orderId orderObjectId')
      .populate('orderObjectId', 'orderId invoiceNumber');

    const vouchers = returns
      .map((r) => {
        const date = new Date(r.createdAt);
        const tallyDate = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
        const partyName = r.customerInfo?.name || 'Customer';
        const amount = Number(r.refundedAmount || 0).toFixed(2);
        return `
          <TALLYMESSAGE xmlns:UDF="TallyUDF">
            <VOUCHER VCHTYPE="Purchase" ACTION="Create">
              <DATE>${tallyDate}</DATE>
              <VOUCHERNUMBER>${r.returnId}</VOUCHERNUMBER>
              <PARTYNAME>${partyName}</PARTYNAME>
              <REFERENCE>${r.orderObjectId?.orderId || r.orderId || r.returnId}</REFERENCE>
              <NARRATION>Return - Warehouse: ${r.warehouseInfo?.warehouseName || ''}</NARRATION>
              <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>Sales Returns</LEDGERNAME>
                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                <AMOUNT>${amount}</AMOUNT>
              </ALLLEDGERENTRIES.LIST>
              <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>Bank</LEDGERNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <AMOUNT>-${amount}</AMOUNT>
              </ALLLEDGERENTRIES.LIST>
            </VOUCHER>
          </TALLYMESSAGE>`;
      })
      .join('');

    const xml = `<?xml version="1.0"?>
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

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', 'attachment; filename="returns-tally.xml"');
    res.send(xml);
  } catch (err) {
    console.error('exportReturnsTallyXml error', err);
    res.status(500).json({ error: 'Failed to export returns Tally XML' });
  }
};


