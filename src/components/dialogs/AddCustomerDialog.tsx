import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User, Mail, Phone, MapPin, Tag, Calendar, Save } from "lucide-react";

interface AddCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddCustomerDialog({ open, onOpenChange }: AddCustomerDialogProps) {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    status: "active",
    gender: "prefer-not",
    dateOfBirth: "",
    tags: "",
    address: "",
    city: "",
    notes: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Save customer
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <DialogTitle className="text-xl">Add Customer</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Create a new customer profile
            </p>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Name Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                First Name <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Enter first name"
                  className="pl-9"
                  value={formData.firstName}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, firstName: e.target.value }))
                  }
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>
                Last Name <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Enter last name"
                  className="pl-9"
                  value={formData.lastName}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, lastName: e.target.value }))
                  }
                  required
                />
              </div>
            </div>
          </div>

          {/* Email & Phone Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="Enter email address"
                  className="pl-9"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, email: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>
                Phone <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Enter phone number"
                  className="pl-9"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  required
                />
              </div>
            </div>
          </div>

          {/* Status & Gender Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={formData.status}
                onValueChange={(v) =>
                  setFormData((prev) => ({ ...prev, status: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select
                value={formData.gender}
                onValueChange={(v) =>
                  setFormData((prev) => ({ ...prev, gender: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prefer-not">Prefer not to say</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* DOB & Tags Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date of Birth</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="date"
                  className="pl-9"
                  value={formData.dateOfBirth}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      dateOfBirth: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="vip, hair-color, etc."
                  className="pl-9"
                  value={formData.tags}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, tags: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>

          {/* Address & City Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Address</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Street address"
                  className="pl-9"
                  value={formData.address}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, address: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input
                placeholder="Enter city"
                value={formData.city}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, city: e.target.value }))
                }
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              placeholder="Any additional information about this customer..."
              value={formData.notes}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, notes: e.target.value }))
              }
              rows={3}
            />
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="gap-2">
              <Save className="w-4 h-4" />
              Add Customer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
