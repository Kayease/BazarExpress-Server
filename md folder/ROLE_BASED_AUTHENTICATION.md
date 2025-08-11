# Role-Based Authentication Implementation

## Overview
This document describes the implementation of role-based authentication where different user roles have different login requirements.

## Authentication Flow

### User Role (Regular Customers)
- **Step 1**: Enter phone number
- **Step 2**: Verify OTP
- **Result**: Logged in

### All Other Roles (Admin, Staff, etc.)
- **Step 1**: Enter phone number
- **Step 2**: Enter password
- **Step 3**: Verify OTP
- **Result**: Logged in

## Backend Changes

### 1. User Model Updates (`models/User.js`)
- Added `password` field (optional, for non-user roles)
- Added password hashing middleware using bcryptjs
- Added `comparePassword()` method for password verification
- Added `requiresPassword()` method to check if user role requires password

### 2. New Authentication Endpoints

#### `/auth/verify-password` (POST)
- Verifies password for non-user roles
- Sends OTP after successful password verification
- **Request**: `{ phone, password }`
- **Response**: `{ success: true, sessionId, message }`

#### Updated `/auth/send-otp` (POST)
- Now checks user role and returns `requiresPassword` flag
- **Request**: `{ phone }`
- **Response**: `{ success: true, sessionId, requiresPassword, userRole }`

#### Updated `/auth/verify-otp` (POST)
- Validates that password was verified for non-user roles
- **Request**: `{ phone, otp, sessionId }`
- **Response**: `{ token, user }`

#### `/auth/users/:id/password` (PATCH)
- Admin-only endpoint to set passwords for non-user roles
- **Request**: `{ password }`
- **Response**: `{ success: true, message }`

### 3. Password Requirements
- Minimum 6 characters
- Only required for non-user roles
- Automatically hashed using bcryptjs with salt rounds of 10

## Frontend Changes

### 1. Login Modal Updates (`components/login-modal.tsx`)
- Added password step between phone and OTP for non-user roles
- Added password input field with validation
- Updated navigation flow to handle 3-step authentication
- Added proper state management for password flow

### 2. Authentication Flow States
- `phone`: Enter phone number
- `password`: Enter password (only for non-user roles)
- `otp`: Enter OTP verification code

## Setup Instructions

### 1. Set Passwords for Existing Admin Users
Run the setup script to set default passwords for existing admin users:

```bash
cd server
node scripts/setAdminPasswords.js
```

**Important**: Change default passwords after first login!

### 2. Create New Admin Users
When creating new admin users through the admin panel, make sure to set their passwords using the new endpoint:

```bash
PATCH /api/auth/users/:id/password
{
  "password": "secure_password_here"
}
```

## Security Features

1. **Password Hashing**: All passwords are hashed using bcryptjs
2. **Role-Based Access**: Only non-user roles require passwords
3. **Session Management**: OTP sessions track password verification status
4. **Admin Controls**: Only admins can set/reset passwords for other users

## User Roles That Require Password

- `admin`
- `product_inventory_management`
- `order_warehouse_management`
- `marketing_content_manager`
- `customer_support_executive`
- `report_finance_analyst`

## User Roles That Don't Require Password

- `user` (regular customers)

## API Error Codes

- `400`: Invalid phone number, password, or OTP format
- `401`: Invalid password or unauthorized access
- `404`: User not found
- `409`: Duplicate user data
- `500`: Internal server error

## Testing

1. Test regular user login (phone → OTP)
2. Test admin user login (phone → password → OTP)
3. Test password verification with wrong password
4. Test OTP verification without password verification for admin users
5. Test password setting for admin users

## Migration Notes

- Existing users are not affected
- Regular users continue to use OTP-only authentication
- Admin users need passwords set before they can log in
- The system is backward compatible with existing authentication tokens