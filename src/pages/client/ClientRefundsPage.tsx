import { ClientSidebar } from "@/components/client/ClientSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCcw, Wallet } from "lucide-react";

export default function ClientRefundsPage() {
  return (
    <ClientSidebar>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Refunds & Credits</h1>
          <p className="text-muted-foreground mt-1">
            Manage refund requests and store credits
          </p>
        </div>

        <Tabs defaultValue="refunds" className="space-y-4">
          <TabsList>
            <TabsTrigger value="refunds" className="gap-2">
              <RefreshCcw className="h-4 w-4" />
              Refund Requests
            </TabsTrigger>
            <TabsTrigger value="credits" className="gap-2">
              <Wallet className="h-4 w-4" />
              Store Credits
            </TabsTrigger>
          </TabsList>

          <TabsContent value="refunds">
            <Card>
              <CardHeader>
                <CardTitle>Refund Requests</CardTitle>
                <CardDescription>
                  Your refund requests and their status
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  No refund requests
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="credits">
            <Card>
              <CardHeader>
                <CardTitle>Store Credits</CardTitle>
                <CardDescription>
                  Credits received from refunds and promotions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  No store credits
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ClientSidebar>
  );
}
