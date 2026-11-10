import { useState } from "react";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { TemplatesPanel } from "@/pages/comms/TemplatesPanel";
import { AnnouncementsPanel } from "@/pages/ProductAnnouncementsPage";

type CommsTab = "templates" | "announcements";

export default function CommsPage() {
  const [tab, setTab] = useState<CommsTab>("templates");

  return (
    <BackofficeLayout>
      <div className="backoffice-page">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight">Templates &amp; announcements</h1>
          <p className="mt-[3px] text-[12.5px] text-muted-foreground">
            Platform-owned copy — the system messages every salon sends, and what we tell salons ourselves.
            Deliberately separate from Comms credits (usage), not combined.
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as CommsTab)}>
          <TabsList>
            <TabsTrigger value="templates">Message templates</TabsTrigger>
            <TabsTrigger value="announcements">Product announcements</TabsTrigger>
          </TabsList>
          <TabsContent value="templates" className="mt-4">
            <TemplatesPanel />
          </TabsContent>
          <TabsContent value="announcements" className="mt-4">
            <AnnouncementsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </BackofficeLayout>
  );
}
