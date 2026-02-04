import { ClientSidebar } from "@/components/client/ClientSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ClientHistoryPage() {
  return (
    <ClientSidebar>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">History</h1>
          <p className="text-muted-foreground mt-1">
            View your transaction and booking history
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>
              All your past transactions across salons
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-center py-8">
              No transaction history
            </p>
          </CardContent>
        </Card>
      </div>
    </ClientSidebar>
  );
}
