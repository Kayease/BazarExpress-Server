
# API URL 404 Errors - FIXED

## Problem
**Error**: `GET http://localhost:3000/api/warehouses 404 (Not Found)`
**Source**: `WarehouseSelector.tsx:39` and `WarehouseSelector.tsx:50`
**When**: Loading product add/edit forms that use WarehouseSelector component

## Root Cause
Components were using **relative URLs** (`/api/warehouses`) which resolve to the **frontend port** (3000) instead of the **backend API port** (4000).

### Incorrect API Calls:
```javascript
// ❌ WRONG - Goes to frontend port 3000
fetch('/api/warehouses', { ... })  
// Resolves to: http://localhost:3000/api/warehouses (404 Not Found)

// ✅ CORRECT - Goes to backend port 4000  
fetch(`${API_URL}/warehouses`, { ... })
// Resolves to: http://localhost:4000/api/warehouses (200 OK)
```

## Components Fixed

### 1. WarehouseSelector.tsx ✅
**File**: `frontend/components/WarehouseSelector.tsx`
**Issue**: Line 39 used `/api/warehouses` (relative URL)
**Fix**: Added `const API_URL = process.env.NEXT_PUBLIC_API_URL` and updated to `${API_URL}/warehouses`

### 2. AdminUserManagement.tsx ✅
**File**: `frontend/components/AdminUserManagement.tsx`
**Issues**: Multiple relative API calls
**Fixes Applied**:
- `/api/admin/users` → `${API_URL}/admin/users`
- `/api/warehouses` → `${API_URL}/warehouses`
- `/api/admin/users/${userId}` → `${API_URL}/admin/users/${userId}`
- `/api/users/admin/${userId}/status` → `${API_URL}/users/admin/${userId}/status`

### 3. RoleBasedBrandList.tsx ✅
**File**: `frontend/components/RoleBasedBrandList.tsx`
**Issue**: Line 51 used `/api/brands/${brand._id}` 
**Fix**: Added API_URL constant and updated to `${API_URL}/brands/${brand._id}`

## Components NOT Changed (Correctly Using Frontend API Routes)

### AdvancedProductForm.tsx ✅ 
- **Call**: `/api/delete-image` → **KEPT AS-IS** (correct frontend API route)
- **Reason**: This calls `app/api/delete-image/route.ts` which is a Next.js API route

### location-modal.tsx ✅
- **Call**: `/api/locations/search` → **KEPT AS-IS** (correct frontend API route)  
- **Reason**: This calls `app/api/locations/search/route.ts` which handles location searches

## API Route Types

### Backend API Routes (Port 4000):
- `/warehouses` - Warehouse management
- `/brands` - Brand management  
- `/products` - Product management
- `/categories` - Category management
- `/admin/users` - User management
- All data CRUD operations

### Frontend API Routes (Port 3000):
- `/api/delete-image` - Cloudinary image deletion
- `/api/locations/search` - Location/address search
- Utility and proxy functions

## Environment Variable Used
```javascript
const API_URL = process.env.NEXT_PUBLIC_API_URL;
// In .env: NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

## Test Results

### Before Fix:
```
❌ GET http://localhost:3000/api/warehouses 404 (Not Found)
❌ WarehouseSelector.tsx:50 Failed to fetch warehouses  
❌ Form dropdowns empty or show loading state
❌ Console errors for missing API endpoints
```

### After Fix:
```
✅ GET http://localhost:4000/api/warehouses 200 (OK)
✅ WarehouseSelector loads warehouse options successfully
✅ Form dropdowns populated with real data
✅ No 404 console errors
```

## Verification Commands

### Test API URL fixes:
```bash
cd frontend
npx playwright test api-url-fix --reporter=line
```

### Manual verification:
1. **Open DevTools Network tab**
2. **Navigate to**: `http://localhost:3001/admin/products/add`
3. **Check requests**:
   - ✅ Should see: `http://localhost:4000/api/warehouses` (200 OK)
   - ❌ Should NOT see: `http://localhost:3000/api/warehouses` (404 Not Found)

## Files Modified

### Component Files:
1. `frontend/components/WarehouseSelector.tsx` - Fixed warehouse API call
2. `frontend/components/AdminUserManagement.tsx` - Fixed all user/warehouse management API calls
3. `frontend/components/RoleBasedBrandList.tsx` - Fixed brand deletion API call

### Test Files Created:
1. `frontend/tests/e2e/api-url-fix.spec.ts` - Comprehensive API URL testing

## Impact

### ✅ Fixed Issues:
- WarehouseSelector 404 errors resolved
- Product form loads successfully
- Warehouse dropdown populated  
- Admin user management functional
- Brand management operations working

### ✅ Security Maintained:
- Authentication headers still sent to backend
- Frontend API routes unchanged
- Environment variables properly used
- CORS settings unaffected

## Pattern for Future Components

```typescript
// ✅ CORRECT PATTERN
const API_URL = process.env.NEXT_PUBLIC_API_URL;

// For backend API calls:
fetch(`${API_URL}/endpoint`, { 
  headers: { 'Authorization': `Bearer ${token}` }
})

// For frontend API routes:
fetch('/api/frontend-endpoint', { ... })
```

This fix ensures all backend API calls are properly routed to the correct server port, resolving the 404 errors and enabling proper form functionality.