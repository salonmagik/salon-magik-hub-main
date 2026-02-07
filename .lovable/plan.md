
# Extended Catalog Multi-Select & Actions Enhancement Plan

## Summary of New Additions

Building on the existing plan, this adds:

1. **Maker-Checker for Deletions** - Only owners can directly delete; other roles request deletion requiring owner approval
2. **Status Chips on Cards** - Visual badges showing Active/Archived/Flagged status on each item
3. **Soft Delete with 7-Day Bin** - Deleted items go to a "Bin" in Settings for 7 days before permanent deletion
4. **5-Second Undo Countdown** - After delete action, 5-second window to undo before item moves to bin
5. **Booking Exclusion** - Soft deleted, permanently deleted, and archived items are excluded from booking

---

## Part 1: Maker-Checker Deletion Workflow

### Behavior by Role

| Role | Delete Action | Workflow |
|------|---------------|----------|
| Owner | Direct delete | Immediately soft-deletes to bin |
| Manager | Request delete | Creates pending deletion request → Owner approves/rejects |
| Supervisor | Request delete | Creates pending deletion request → Owner approves/rejects |
| Receptionist | No delete | Delete action hidden |
| Staff | No delete | Delete action hidden |

### Database: Deletion Requests Table

```sql
CREATE TABLE catalog_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_id UUID NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('service', 'product', 'package', 'voucher')),
  item_name TEXT NOT NULL,
  requested_by_id UUID NOT NULL REFERENCES auth.users(id),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by_id UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS policies
ALTER TABLE catalog_deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read tenant deletion requests"
  ON catalog_deletion_requests FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Users can create deletion requests"
  ON catalog_deletion_requests FOR INSERT
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Owners can update deletion requests"
  ON catalog_deletion_requests FOR UPDATE
  USING (is_tenant_owner(auth.uid(), tenant_id));
```

### UI Flow for Non-Owners

When a non-owner clicks "Delete":

```
+------------------------------------------+
| Request Deletion                         |
+------------------------------------------+
| You're requesting deletion of:           |
|                                          |
| • Swedish Massage ($50)                  |
| • Deep Tissue Massage ($75)              |
|                                          |
| Reason for deletion *                    |
| [No longer offered at this location   ]  |
|                                          |
| Note: An owner must approve this request |
| before the items are removed.            |
|                                          |
|     [Cancel]  [Submit Request]           |
+------------------------------------------+
```

### Notification to Owner

When deletion request is created:
- Notification sent to all owners
- Appears in notification panel with "Approve" / "Reject" actions
- Links to new "Pending Actions" section in Settings (or dedicated review page)

---

## Part 2: Status Chips on Catalog Cards

### Visual Status Indicators

Each `SelectableItemCard` displays a status badge:

| Status | Badge Style | Visible To |
|--------|-------------|------------|
| Active | Green, "Active" | All (default, often hidden as it's implied) |
| Flagged | Yellow/Orange, "Flagged" with icon | All staff |
| Archived | Gray, "Archived" | Staff only (not visible to customers) |
| Deleted (In Bin) | Red/Muted, "In Bin" | Staff in bin view only |

### Implementation

Update `SelectableItemCard` to accept and display status:

```tsx
interface CatalogItem {
  id: string;
  type: "service" | "product" | "package" | "voucher";
  name: string;
  description: string;
  price: number;
  status: "active" | "inactive" | "archived" | "deleted";
  is_flagged?: boolean;
  // ... other fields
}

// Status chip render logic
function getStatusChip(status: string, isFlagged: boolean) {
  if (isFlagged) {
    return (
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
        <Flag className="w-3 h-3 mr-1" />
        Flagged
      </Badge>
    );
  }
  
  switch (status) {
    case "archived":
      return (
        <Badge variant="secondary" className="bg-gray-100 text-gray-600">
          <Archive className="w-3 h-3 mr-1" />
          Archived
        </Badge>
      );
    case "deleted":
      return (
        <Badge variant="destructive" className="bg-red-50 text-red-700">
          <Trash2 className="w-3 h-3 mr-1" />
          In Bin
        </Badge>
      );
    case "active":
    default:
      return null; // Active is default, no badge needed
  }
}
```

### Card Layout with Status

```
+------------------------------------------------+
| [✓] | [IMG] | Swedish Massage      | [Flagged] |
|     |       | 60 min • Relaxing... |   $50.00  |
+------------------------------------------------+
```

---

## Part 3: Soft Delete with 7-Day Bin

### Database: Soft Delete Columns

Add to all catalog tables:

```sql
ALTER TABLE services 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_by_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_by_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

ALTER TABLE packages 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_by_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

ALTER TABLE vouchers 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_by_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS deletion_reason TEXT;
```

### Query Updates

Update all hooks to exclude deleted items by default:

```typescript
// useServices.tsx
const { data } = await supabase
  .from("services")
  .select("*")
  .eq("tenant_id", tenantId)
  .is("deleted_at", null) // Exclude soft-deleted
  .order("name");

// New: useBinItems.tsx for fetching deleted items
const { data } = await supabase
  .from("services")
  .select("*")
  .eq("tenant_id", tenantId)
  .not("deleted_at", "is", null) // Only deleted items
  .order("deleted_at", { ascending: false });
```

### Bin Tab in Settings

Add new "Bin" section to Settings page (or as sub-tab under catalog):

```
+--------------------------------------------------+
| Bin                                              |
| Items deleted in the last 7 days appear here.    |
| After 7 days, items are permanently removed.     |
|                                                  |
| [Empty Bin] (destructive, confirms first)        |
+--------------------------------------------------+
| [IMG] | Swedish Massage  | Deleted 2 days ago   |
|       | Service • $50    | [Restore] [Delete]   |
+--------------------------------------------------+
| [IMG] | Hair Gel         | Deleted 5 days ago   |
|       | Product • $15    | Auto-deletes in 2d   |
|       |                  | [Restore] [Delete]   |
+--------------------------------------------------+
```

### Automatic Permanent Deletion

A scheduled job (or Edge Function cron) permanently deletes items older than 7 days:

```sql
-- Run daily via pg_cron or Edge Function
DELETE FROM services WHERE deleted_at < now() - interval '7 days';
DELETE FROM products WHERE deleted_at < now() - interval '7 days';
DELETE FROM packages WHERE deleted_at < now() - interval '7 days';
DELETE FROM vouchers WHERE deleted_at < now() - interval '7 days';
```

Alternative: Client-side check on bin load to filter and trigger permanent deletion.

---

## Part 4: 5-Second Undo Countdown

### UX Flow

When user confirms deletion:

1. **Toast appears** with 5-second countdown
2. **Item visually marked** as pending deletion (slightly faded)
3. **User can click "Undo"** to cancel
4. **After 5 seconds**, toast changes to "Sent to Bin"

### Implementation

```tsx
// In ServicesPage.tsx
const [pendingDeletions, setPendingDeletions] = useState<Map<string, NodeJS.Timeout>>(new Map());
const [undoCountdowns, setUndoCountdowns] = useState<Map<string, number>>(new Map());

const handleSoftDelete = async (itemIds: string[], reason: string) => {
  // Start countdown for each item
  itemIds.forEach(id => {
    let countdown = 5;
    setUndoCountdowns(prev => new Map(prev).set(id, countdown));
    
    const interval = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(interval);
        executeSoftDelete(id, reason);
        setUndoCountdowns(prev => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      } else {
        setUndoCountdowns(prev => new Map(prev).set(id, countdown));
      }
    }, 1000);
    
    setPendingDeletions(prev => new Map(prev).set(id, interval));
  });
  
  // Show toast with undo action
  toast({
    title: `Deleting ${itemIds.length} item(s)...`,
    description: "Click Undo to cancel",
    action: (
      <Button variant="outline" size="sm" onClick={() => handleUndo(itemIds)}>
        Undo ({undoCountdowns.get(itemIds[0]) || 5}s)
      </Button>
    ),
    duration: 6000, // Slightly longer than countdown
  });
};

const handleUndo = (itemIds: string[]) => {
  itemIds.forEach(id => {
    const timer = pendingDeletions.get(id);
    if (timer) {
      clearInterval(timer);
    }
    setPendingDeletions(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    setUndoCountdowns(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  });
  
  toast({ title: "Deletion cancelled" });
};

const executeSoftDelete = async (itemId: string, reason: string) => {
  const itemType = getItemType(itemId);
  await supabase
    .from(getTableName(itemType))
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by_id: user.id,
      deletion_reason: reason,
    })
    .eq("id", itemId);
  
  toast({ title: "Item sent to bin", description: "Can be restored within 7 days" });
  refetchAll();
};
```

### Toast UI

```
+--------------------------------------------------+
| Deleting 2 item(s)...                      [X]   |
| Click Undo to cancel                             |
|                                                  |
| [Undo (3s)]                                      |
+--------------------------------------------------+
           ↓ (after 5 seconds)
+--------------------------------------------------+
| ✓ Sent to Bin                              [X]   |
| 2 items moved to bin. Restore within 7 days.     |
+--------------------------------------------------+
```

---

## Part 5: Booking Exclusion Logic

### Which Items Are Excluded from Booking

| Status | Available for Booking? | Reasoning |
|--------|------------------------|-----------|
| Active | ✅ Yes | Normal state |
| Inactive | ❌ No | Temporarily unavailable |
| Archived | ❌ No | Permanently hidden but data preserved |
| Deleted (In Bin) | ❌ No | Pending permanent deletion |
| Permanently Deleted | ❌ N/A | No longer exists |
| Flagged + Active | ✅ Yes | Internal marker, still bookable |
| Flagged + Archived | ❌ No | Archived takes precedence |

### Update Public Booking Views

Update the `public_booking_*` views and RLS policies:

```sql
-- Services available for booking
CREATE OR REPLACE VIEW public.bookable_services AS
SELECT * FROM services
WHERE status = 'active'
  AND deleted_at IS NULL
  AND tenant_id IN (
    SELECT id FROM tenants 
    WHERE online_booking_enabled = true 
    AND slug IS NOT NULL
  );

-- Products available for booking
CREATE OR REPLACE VIEW public.bookable_products AS
SELECT * FROM products
WHERE status = 'active'
  AND deleted_at IS NULL
  AND tenant_id IN (
    SELECT id FROM tenants 
    WHERE online_booking_enabled = true 
    AND slug IS NOT NULL
  );

-- Packages available for booking
CREATE OR REPLACE VIEW public.bookable_packages AS
SELECT * FROM packages
WHERE status = 'active'
  AND deleted_at IS NULL
  AND tenant_id IN (
    SELECT id FROM tenants 
    WHERE online_booking_enabled = true 
    AND slug IS NOT NULL
  );
```

### Update `usePublicCatalog` Hook

```typescript
// Exclude archived and deleted items
const { data: services } = await supabase
  .from("services")
  .select("*")
  .eq("tenant_id", tenantId)
  .eq("status", "active")
  .is("deleted_at", null);
```

---

## Part 6: New Permissions

### Add Catalog Permissions

```typescript
// In DEFAULT_ROLE_PERMISSIONS
"catalog:delete": true,      // owner only - direct delete
"catalog:request_delete": true,  // manager, supervisor - request deletion
"catalog:archive": true,     // owner, manager
"catalog:flag": true,        // all staff
"catalog:edit": true,        // owner, manager + overrides
```

```sql
-- Add new permission rows
INSERT INTO role_permissions (tenant_id, role, module, allowed)
SELECT DISTINCT tenant_id, 'owner', 'catalog:delete', true FROM role_permissions;

INSERT INTO role_permissions (tenant_id, role, module, allowed)
SELECT DISTINCT tenant_id, 'manager', 'catalog:request_delete', true FROM role_permissions;

INSERT INTO role_permissions (tenant_id, role, module, allowed)
SELECT DISTINCT tenant_id, 'manager', 'catalog:delete', false FROM role_permissions;
```

---

## Database Migration Summary

```sql
-- 1. Soft delete columns
ALTER TABLE services 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_by_id UUID,
ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_by_id UUID,
ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

ALTER TABLE packages 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_by_id UUID,
ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

ALTER TABLE vouchers 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_by_id UUID,
ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

-- 2. Deletion requests table
CREATE TABLE catalog_deletion_requests (...);

-- 3. Reason columns for flag/archive (from previous plan)
ALTER TABLE services ADD COLUMN IF NOT EXISTS flag_reason TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS archive_reason TEXT;
-- (repeat for products, packages, vouchers)

-- 4. Update views to exclude deleted items
CREATE OR REPLACE VIEW public.bookable_services AS ...;
CREATE OR REPLACE VIEW public.bookable_products AS ...;
CREATE OR REPLACE VIEW public.bookable_packages AS ...;
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/pages/salon/ServicesPage.tsx` | EDIT | Status chips, 5-sec undo, maker-checker logic |
| `src/components/catalog/BulkActionsBar.tsx` | EDIT | Conditional delete based on role |
| `src/pages/salon/SettingsPage.tsx` | EDIT | Add Bin tab with restore/delete actions |
| `src/hooks/useBinItems.tsx` | CREATE | Fetch soft-deleted items |
| `src/hooks/useDeletionRequests.tsx` | CREATE | Manage deletion requests |
| `src/components/dialogs/RequestDeleteDialog.tsx` | CREATE | Non-owner delete request modal |
| `src/components/dialogs/DeleteConfirmDialog.tsx` | EDIT | Add undo countdown logic |
| `src/hooks/usePublicCatalog.tsx` | EDIT | Exclude archived/deleted items |
| `src/hooks/useServices.tsx` | EDIT | Filter out deleted_at IS NOT NULL |
| `src/hooks/useProducts.tsx` | EDIT | Filter out deleted_at IS NOT NULL |
| `src/hooks/usePackages.tsx` | EDIT | Filter out deleted_at IS NOT NULL |
| `src/hooks/usePermissions.tsx` | EDIT | Add catalog:delete, catalog:request_delete |
| Database migration | CREATE | Add soft delete columns, deletion requests table |

---

## UI Flow Diagrams

### Owner Delete Flow
```
Owner clicks Delete
         │
         ▼
┌─────────────────────┐
│ Delete Confirmation │
│ (type name/DELETE)  │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Toast: Deleting...  │
│ [Undo (5s)]         │
└─────────┬───────────┘
          │ (5 seconds)
          ▼
┌─────────────────────┐
│ Item → Bin          │
│ "Sent to Bin"       │
└─────────────────────┘
```

### Non-Owner Delete Flow
```
Manager clicks Delete
         │
         ▼
┌─────────────────────────┐
│ Request Deletion Dialog │
│ • Enter reason          │
│ • Submit to owner       │
└─────────────┬───────────┘
              │
              ▼
┌─────────────────────────┐
│ Notification to Owners  │
│ • View request details  │
│ • [Approve] [Reject]    │
└─────────────┬───────────┘
              │
    ┌─────────┴─────────┐
    │                   │
 Approve             Reject
    │                   │
    ▼                   ▼
┌────────────┐    ┌────────────┐
│ Item → Bin │    │ Request    │
│            │    │ cancelled  │
└────────────┘    └────────────┘
```

### Bin Lifecycle
```
Item Soft Deleted
         │
         ▼
┌─────────────────────┐
│ BIN (7 days)        │
│ • Can be restored   │
│ • Can be deleted    │
│   permanently       │
└─────────────────────┘
         │
    ┌────┴────┐
    │         │
 Restore   7 days pass / Empty Bin
    │         │
    ▼         ▼
┌────────┐  ┌────────────────────┐
│ Active │  │ PERMANENTLY DELETED │
│        │  │ (unrecoverable)     │
└────────┘  └────────────────────┘
```

---

## Testing Checklist

### Maker-Checker
- [ ] Owner can delete directly (goes to bin)
- [ ] Manager sees "Request Deletion" instead of direct delete
- [ ] Supervisor sees "Request Deletion"
- [ ] Receptionist and Staff do not see delete option
- [ ] Deletion request creates notification for owners
- [ ] Owner can approve/reject deletion requests
- [ ] Approved request moves item to bin
- [ ] Rejected request notifies requester

### Status Chips
- [ ] Active items show no status chip (or green "Active")
- [ ] Flagged items show yellow "Flagged" badge
- [ ] Archived items show gray "Archived" badge
- [ ] Deleted items in bin show red "In Bin" badge

### Soft Delete & Bin
- [ ] Deleted items appear in Settings > Bin
- [ ] Bin shows deletion date and countdown to permanent delete
- [ ] "Restore" returns item to active status
- [ ] "Delete Permanently" removes from database
- [ ] "Empty Bin" clears all items (with confirmation)
- [ ] Items auto-delete after 7 days

### 5-Second Undo
- [ ] Toast appears with countdown
- [ ] Clicking "Undo" cancels deletion
- [ ] After 5 seconds, item moves to bin
- [ ] Toast changes to "Sent to Bin"

### Booking Exclusion
- [ ] Active items appear on booking page
- [ ] Archived items do not appear on booking page
- [ ] Deleted items do not appear on booking page
- [ ] Flagged + Active items still appear on booking page
