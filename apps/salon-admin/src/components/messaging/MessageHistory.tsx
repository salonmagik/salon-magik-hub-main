import { useState, useMemo } from "react";
import { format } from "date-fns";
import { Mail, Phone, MessageSquare, ChevronDown, ChevronUp, Filter, X } from "lucide-react";
import { useManualMessages } from "@/hooks/useManualMessages";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Skeleton } from "@ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { DatePicker } from "@ui/date-picker";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@ui/collapsible";
import { cn } from "@shared/utils";

interface MessageHistoryProps {
  customerId: string;
}

type ChannelFilter = "all" | "email" | "sms" | "whatsapp";

const channelIcons = {
  email: Mail,
  sms: Phone,
  whatsapp: MessageSquare,
};

const statusVariants = {
  sent: { variant: "default" as const, className: "bg-green-500 hover:bg-green-600" },
  failed: { variant: "destructive" as const, className: "" },
  pending: { variant: "secondary" as const, className: "bg-yellow-500 hover:bg-yellow-600" },
};

export function MessageHistory({ customerId }: MessageHistoryProps) {
  const { currentTenant } = useAuth();
  const { messages, isLoading } = useManualMessages({
    customerId,
    tenantId: currentTenant?.id || "",
  });

  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Filter messages
  const filteredMessages = useMemo(() => {
    return messages.filter((msg) => {
      // Channel filter
      if (channelFilter !== "all" && msg.channel !== channelFilter) {
        return false;
      }

      // Date range filter
      if (dateFrom) {
        const msgDate = new Date(msg.created_at);
        if (msgDate < dateFrom) {
          return false;
        }
      }

      if (dateTo) {
        const msgDate = new Date(msg.created_at);
        // Set time to end of day for dateTo
        const dateToEnd = new Date(dateTo);
        dateToEnd.setHours(23, 59, 59, 999);
        if (msgDate > dateToEnd) {
          return false;
        }
      }

      return true;
    });
  }, [messages, channelFilter, dateFrom, dateTo]);

  const toggleExpanded = (messageId: string) => {
    setExpandedMessageId(expandedMessageId === messageId ? null : messageId);
  };

  const clearFilters = () => {
    setChannelFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const hasActiveFilters = channelFilter !== "all" || dateFrom !== undefined || dateTo !== undefined;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Message History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-4 p-4 border rounded-lg">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/4" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Message History</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
          >
            <Filter className="h-4 w-4" />
            Filters
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 text-xs">
                !
              </Badge>
            )}
          </Button>
        </div>

        {/* Filters Section */}
        {showFilters && (
          <div className="mt-4 space-y-4 border-t pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Channel Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Channel</label>
                <Select value={channelFilter} onValueChange={(value: ChannelFilter) => setChannelFilter(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All channels" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Channels</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date From */}
              <div className="space-y-2">
                <label className="text-sm font-medium">From Date</label>
                <DatePicker
                  value={dateFrom}
                  onChange={setDateFrom}
                  placeholder="Select start date"
                  maxDate={dateTo || new Date()}
                />
              </div>

              {/* Date To */}
              <div className="space-y-2">
                <label className="text-sm font-medium">To Date</label>
                <DatePicker
                  value={dateTo}
                  onChange={setDateTo}
                  placeholder="Select end date"
                  minDate={dateFrom}
                  maxDate={new Date()}
                />
              </div>
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-2">
                <X className="h-4 w-4" />
                Clear Filters
              </Button>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent>
        {filteredMessages.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No messages sent yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              {hasActiveFilters
                ? "No messages match your filters. Try adjusting your filter criteria."
                : "Send your first message to start communication history."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredMessages.map((message) => {
              const Icon = channelIcons[message.channel];
              const isExpanded = expandedMessageId === message.id;
              const statusConfig = statusVariants[message.status];

              return (
                <Collapsible key={message.id} open={isExpanded} onOpenChange={() => toggleExpanded(message.id)}>
                  <div className="border rounded-lg hover:bg-accent/50 transition-colors">
                    <CollapsibleTrigger asChild>
                      <button className="w-full p-4 text-left flex items-start gap-4 cursor-pointer">
                        {/* Channel Icon */}
                        <div className={cn(
                          "flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center",
                          message.channel === "email" && "bg-blue-100 text-blue-600",
                          message.channel === "sms" && "bg-green-100 text-green-600",
                          message.channel === "whatsapp" && "bg-emerald-100 text-emerald-600"
                        )}>
                          <Icon className="h-5 w-5" />
                        </div>

                        {/* Message Info */}
                        <div className="flex-1 min-w-0">
                          {/* Subject/Preview and Status */}
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex-1 min-w-0">
                              {message.subject && (
                                <h4 className="font-medium text-sm truncate">{message.subject}</h4>
                              )}
                              {message.template && (
                                <h4 className="font-medium text-sm truncate">
                                  WhatsApp Template: {message.template.template_name}
                                </h4>
                              )}
                              <p className="text-sm text-muted-foreground truncate mt-0.5">
                                {message.message ? (
                                  message.message.length > 100
                                    ? `${message.message.substring(0, 100)}...`
                                    : message.message
                                ) : (
                                  "WhatsApp message via template"
                                )}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Badge variant={statusConfig.variant} className={statusConfig.className}>
                                {message.status}
                              </Badge>
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>

                          {/* Metadata */}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                            <span className="capitalize">{message.channel}</span>
                            <span>•</span>
                            <span>
                              {format(new Date(message.created_at), "MMM d, yyyy 'at' h:mm a")}
                            </span>
                            {message.credits_used > 0 && (
                              <>
                                <span>•</span>
                                <span>{message.credits_used} credit{message.credits_used !== 1 ? "s" : ""}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </button>
                    </CollapsibleTrigger>

                    {/* Expanded Content */}
                    <CollapsibleContent>
                      <div className="px-4 pb-4 pt-2 border-t space-y-3">
                        {/* Full Message Content */}
                        {message.message && (
                          <div>
                            <h5 className="font-medium text-sm mb-1">Message Content</h5>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/50 p-3 rounded-md">
                              {message.message}
                            </p>
                          </div>
                        )}

                        {/* Template Variables */}
                        {message.template_variables && Object.keys(message.template_variables).length > 0 && (
                          <div>
                            <h5 className="font-medium text-sm mb-1">Template Variables</h5>
                            <div className="bg-muted/50 p-3 rounded-md">
                              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                {Object.entries(message.template_variables).map(([key, value]) => (
                                  <div key={key}>
                                    <dt className="font-medium text-muted-foreground">{key}:</dt>
                                    <dd className="mt-0.5">{value as string}</dd>
                                  </div>
                                ))}
                              </dl>
                            </div>
                          </div>
                        )}

                        {/* Error Message */}
                        {message.error_message && (
                          <div>
                            <h5 className="font-medium text-sm mb-1 text-destructive">Error</h5>
                            <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                              {message.error_message}
                            </p>
                          </div>
                        )}

                        {/* Additional Metadata */}
                        <div className="grid grid-cols-2 gap-4 text-sm pt-2 border-t">
                          {message.sent_at && (
                            <div>
                              <span className="font-medium text-muted-foreground">Sent At:</span>
                              <p className="mt-0.5">
                                {format(new Date(message.sent_at), "MMM d, yyyy 'at' h:mm a")}
                              </p>
                            </div>
                          )}
                          <div>
                            <span className="font-medium text-muted-foreground">Status:</span>
                            <p className="mt-0.5 capitalize">{message.status}</p>
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
