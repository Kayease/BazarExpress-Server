# 🛡️ Admin Portal Roles & Permissions

This document outlines the roles and permissions for the Admin Panel of our web platform. Each role is carefully designed to ensure smooth operations, data security, and access control across different business functions such as product management, order processing, content management, customer support, and finance.

---

## 📌 Overview

We have defined **six core roles** in the admin portal to efficiently manage different areas of the platform. Some roles are **warehouse-specific**, meaning users assigned to them will only see and manage data related to their assigned warehouse(s).

---

## 🧑‍💻 1. Super Admin

> **Full system access with no restrictions.**

- **Access to:** All sections
- **Permissions:**  
  - View / Add / Edit / Delete everything
  - Manage all admin users and assign roles
  - Assign warehouses to users
  - Configure any settings (e.g., invoice, tax, delivery)

---

## 🛒 2. Product and Inventory Management

> Manages product listings and inventory for **assigned warehouse(s)** only. Limited control over brands and categories.

### ✅ Access To:
- Products  
- Brands  
- Categories & Subcategories

### 🔐 Permissions:
| Section | Permissions |
|---------|-------------|
| **Products** | View / Add / Edit / Delete — **for assigned warehouse(s) only** |
| **Brands** | View all, Create new, **Edit and delete only brands they created** |
| **Categories** | View all, Create new, **Edit and delete only categories they created** |

### ⚠️ Notes:
- Cannot edit or delete brands/categories created by other admins.
- No access to other warehouse inventories.

---

## 🚚 3. Order and Warehouse Management

> Handles order lifecycle and warehouse settings for **assigned warehouse(s)**.

### ✅ Access To:
- All Orders  
- New Orders  
- Delivered Orders  
- Cancelled Orders  
- Refunded Orders  
- Warehouses

### 🔐 Permissions:
| Section | Permissions |
|---------|-------------|
| **Orders** | View & change status **only for orders in assigned warehouse(s)** |
| **Warehouses** | View assigned warehouse(s), Edit settings, **No delete permission** |

---

## 📢 4. Marketing & Content Manager

> Manages all marketing, promotional, and content publishing sections.

### ✅ Access To:
- Banners  
- Promocodes  
- Blog  
- Newsletter  
- Notice

### 🔐 Permissions:
| Section | Permissions |
|---------|-------------|
| All | View / Add / Edit / Delete / Schedule |

---

## 🎧 5. Customer Support Executive

> Handles customer queries, feedback, and user status changes. Has read-only access to all orders.

### ✅ Access To:
- Users  
- Enquiry  
- Rating & Reviews  
- All Orders (read-only)

### 🔐 Permissions:
| Section | Permissions |
|---------|-------------|
| **Users** | View all, **Change status (Active/Inactive only)**, **Cannot delete or change roles** |
| **Rating & Reviews** | Full control: View / Approve / Reject / Moderate |
| **Enquiry** | View / Respond / Update Status — **Cannot delete** |
| **Orders** | View all order details (read-only) |

---

## 📊 6. Report and Finance Analyst

> Manages analytics, tax rules, delivery configurations, and invoice templates.

### ✅ Access To:
- Reports  
- Invoice Settings  
- Taxes  
- Delivery Settings

### 🔐 Permissions:
| Section | Permissions |
|---------|-------------|
| All | View / Add / Edit / Delete / Export |

---

## 🔐 Role Summary Table

| Role                       | Access Scope                            | Permissions Summary                                      |
|----------------------------|------------------------------------------|----------------------------------------------------------|
| **Super Admin**            | Entire system                            | Full control + user & role management                    |
| **Product & Inventory**    | Products (assigned warehouses), Brands, Categories | Limited to assigned warehouse products, own-created brands/categories |
| **Order & Warehouse**      | Orders & warehouse settings              | Orders from assigned warehouse only, can edit status     |
| **Marketing & Content**    | Banners, Blog, Notice, Newsletter, Promocodes | Full control                                             |
| **Customer Support**       | Users, Reviews, Enquiries, Orders (read-only) | Moderate reviews, update user status, respond to enquiries |
| **Report & Finance Analyst**| Reports, Taxes, Invoice, Delivery Settings | Full access to analytics and finance settings            |

----

## 📁Important Enhancements
- Multi-role assignments for hybrid responsibilities

Notice: For Order and Warehouse Management and Product and Inventory Management, we have to assign the warehouse also in rest of the role no need to assign warehouse.
