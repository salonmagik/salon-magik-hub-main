import { useState, useRef } from "react";
import { Button } from "@ui/button";
import { Textarea } from "@ui/textarea";
import { Label } from "@ui/label";
import { DrawingCanvas } from "./DrawingCanvas";
import { Paperclip, Pencil, X, Image as ImageIcon, FileText, Loader2 } from "lucide-react";
import { cn } from "@shared/utils";

interface Attachment {
  id: string;
  fileName: string;
  fileType: string;
  dataUrl: string;
  isDrawing: boolean;
}

interface AppointmentNotesInputProps {
  value: string;
  onChange: (value: string) => void;
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
  placeholder?: string;
  rows?: number;
  label?: string;
  disabled?: boolean;
}

export function AppointmentNotesInput({
  value,
  onChange,
  attachments,
  onAttachmentsChange,
  placeholder = "Add any special instructions or reminders...",
  rows = 3,
  label = "Notes",
  disabled = false,
}: AppointmentNotesInputProps) {
  const [showDrawingCanvas, setShowDrawingCanvas] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const newAttachments: Attachment[] = [];

    for (const file of Array.from(files)) {
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert(`File "${file.name}" is too large. Maximum size is 5MB.`);
        continue;
      }

      // Read file as data URL
      const dataUrl = await readFileAsDataUrl(file);
      newAttachments.push({
        id: crypto.randomUUID(),
        fileName: file.name,
        fileType: file.type,
        dataUrl,
        isDrawing: false,
      });
    }

    onAttachmentsChange([...attachments, ...newAttachments]);
    setIsUploading(false);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleDrawingSave = (dataUrl: string) => {
    const newAttachment: Attachment = {
      id: crypto.randomUUID(),
      fileName: `drawing-${Date.now()}.png`,
      fileType: "image/png",
      dataUrl,
      isDrawing: true,
    };
    onAttachmentsChange([...attachments, newAttachment]);
    setShowDrawingCanvas(false);
  };

  const removeAttachment = (id: string) => {
    onAttachmentsChange(attachments.filter((a) => a.id !== id));
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith("image/")) {
      return <ImageIcon className="w-4 h-4" />;
    }
    return <FileText className="w-4 h-4" />;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isUploading}
            className="h-8 px-2 text-muted-foreground hover:text-foreground"
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Paperclip className="w-4 h-4" />
            )}
            <span className="ml-1 text-xs">Attach</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowDrawingCanvas(true)}
            disabled={disabled || showDrawingCanvas}
            className="h-8 px-2 text-muted-foreground hover:text-foreground"
          >
            <Pencil className="w-4 h-4" />
            <span className="ml-1 text-xs">Draw</span>
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx"
        onChange={handleFileSelect}
        className="hidden"
      />

      <Textarea
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        disabled={disabled}
      />

      {/* Drawing Canvas */}
      {showDrawingCanvas && (
        <div className="border rounded-lg p-3 bg-muted/30">
          <p className="text-sm font-medium mb-2">Draw a note</p>
          <DrawingCanvas
            onSave={handleDrawingSave}
            onCancel={() => setShowDrawingCanvas(false)}
          />
        </div>
      )}

      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {attachments.length} attachment{attachments.length !== 1 ? "s" : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className={cn(
                  "relative group border rounded-lg overflow-hidden",
                  attachment.fileType.startsWith("image/")
                    ? "w-20 h-20"
                    : "px-3 py-2 flex items-center gap-2"
                )}
              >
                {attachment.fileType.startsWith("image/") ? (
                  <img
                    src={attachment.dataUrl}
                    alt={attachment.fileName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <>
                    {getFileIcon(attachment.fileType)}
                    <span className="text-xs truncate max-w-24">
                      {attachment.fileName}
                    </span>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment.id)}
                  className={cn(
                    "absolute bg-destructive text-destructive-foreground rounded-full p-0.5",
                    "opacity-0 group-hover:opacity-100 transition-opacity",
                    attachment.fileType.startsWith("image/")
                      ? "top-1 right-1"
                      : "-top-1 -right-1"
                  )}
                >
                  <X className="w-3 h-3" />
                </button>
                {attachment.isDrawing && (
                  <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] text-center py-0.5">
                    Drawing
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
