import { Upload, FileText, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ExportDropdownProps {
  onExport: (format: "csv" | "xlsx") => void;
  disabled?: boolean;
  label?: string;
}

export function ExportDropdown({ onExport, disabled, label = "Export" }: ExportDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <Upload className="w-4 h-4 mr-2" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onExport("csv")}>
          <FileText className="w-4 h-4 mr-2" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport("xlsx")}>
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Export as XLS
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
