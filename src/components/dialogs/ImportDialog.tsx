import { useState } from "react";
import { Download, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface TemplateColumn {
  header: string;
  example: string;
  required: boolean;
}

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  templateColumns: TemplateColumn[];
  templateFileName: string;
  onImport: (file: File) => Promise<void>;
}

export function ImportDialog({
  open,
  onOpenChange,
  title,
  description = "Upload an XLS or CSV file to import data",
  templateColumns,
  templateFileName,
  onImport,
}: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleDownloadTemplate = () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      templateColumns.map((c) => c.header),
      templateColumns.map((c) => c.example),
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
    XLSX.writeFile(workbook, `${templateFileName}-template.xlsx`);
  };

  const handleImport = async () => {
    if (!file) return;
    setIsImporting(true);
    try {
      await onImport(file);
      onOpenChange(false);
      setFile(null);
    } catch (error) {
      console.error("Import error:", error);
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Download */}
          <div className="p-4 border rounded-lg bg-muted/50">
            <p className="text-sm font-medium mb-2">Need a template?</p>
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <Download className="w-4 h-4 mr-2" />
              Download XLS Template
            </Button>
          </div>

          {/* Expected Format Table */}
          <div>
            <p className="text-sm font-medium mb-2">Expected columns:</p>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-9">Column</TableHead>
                    <TableHead className="h-9">Example</TableHead>
                    <TableHead className="h-9">Required</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templateColumns.map((col) => (
                    <TableRow key={col.header}>
                      <TableCell className="py-2 font-mono text-xs">{col.header}</TableCell>
                      <TableCell className="py-2 text-xs text-muted-foreground">{col.example}</TableCell>
                      <TableCell className="py-2">
                        {col.required ? (
                          <Badge variant="destructive" className="text-xs">Required</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Optional</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* File Upload */}
          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
              id="import-file-input"
            />
            <label htmlFor="import-file-input" className="cursor-pointer">
              <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {file ? file.name : "Click to select file or drag and drop"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports .xlsx, .xls, .csv
              </p>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!file || isImporting}>
            {isImporting ? "Importing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
