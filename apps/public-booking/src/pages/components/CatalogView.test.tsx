import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CatalogView } from "./CatalogView";

vi.mock("./ItemCard", () => ({
  ItemCard: ({ name }: { name: string }) => <div>{name}</div>,
}));

const baseProps = {
  categories: [],
  packages: [],
  products: [],
  currency: "USD",
  onLocationFilterChange: () => {},
};

describe("CatalogView", () => {
  it("strict mode only renders items mapped to allowed locations", () => {
    render(
      <CatalogView
        {...baseProps}
        strictLocationScope
        strictScopedLocationIds={["loc-gh"]}
        selectedLocationIds={[]}
        locations={[{ id: "loc-gh", name: "Accra Branch", city: "Accra", country: "GH" } as never]}
        services={[
          {
            id: "service-gh",
            name: "Braids GH",
            description: null,
            price: 100,
            duration_minutes: 60,
            image_urls: [],
            category_id: null,
            deposit_required: false,
            deposit_amount: null,
            deposit_percentage: null,
            location_ids: ["loc-gh"],
          } as never,
          {
            id: "service-ng",
            name: "Braids NG",
            description: null,
            price: 100,
            duration_minutes: 60,
            image_urls: [],
            category_id: null,
            deposit_required: false,
            deposit_amount: null,
            deposit_percentage: null,
            location_ids: ["loc-ng"],
          } as never,
          {
            id: "service-unmapped",
            name: "Unmapped Service",
            description: null,
            price: 100,
            duration_minutes: 60,
            image_urls: [],
            category_id: null,
            deposit_required: false,
            deposit_amount: null,
            deposit_percentage: null,
            location_ids: [],
          } as never,
        ]}
      />,
    );

    expect(screen.getByText("Braids GH")).toBeInTheDocument();
    expect(screen.queryByText("Braids NG")).not.toBeInTheDocument();
    expect(screen.queryByText("Unmapped Service")).not.toBeInTheDocument();
  });

  it("legacy mode keeps unmapped items visible when location filter is applied", () => {
    render(
      <CatalogView
        {...baseProps}
        strictLocationScope={false}
        selectedLocationIds={["loc-gh"]}
        locations={[
          { id: "loc-gh", name: "Accra Branch", city: "Accra", country: "GH" } as never,
          { id: "loc-ng", name: "Lagos Branch", city: "Lagos", country: "NG" } as never,
        ]}
        services={[
          {
            id: "service-gh",
            name: "Braids GH",
            description: null,
            price: 100,
            duration_minutes: 60,
            image_urls: [],
            category_id: null,
            deposit_required: false,
            deposit_amount: null,
            deposit_percentage: null,
            location_ids: ["loc-gh"],
          } as never,
          {
            id: "service-ng",
            name: "Braids NG",
            description: null,
            price: 100,
            duration_minutes: 60,
            image_urls: [],
            category_id: null,
            deposit_required: false,
            deposit_amount: null,
            deposit_percentage: null,
            location_ids: ["loc-ng"],
          } as never,
          {
            id: "service-unmapped",
            name: "Unmapped Service",
            description: null,
            price: 100,
            duration_minutes: 60,
            image_urls: [],
            category_id: null,
            deposit_required: false,
            deposit_amount: null,
            deposit_percentage: null,
            location_ids: [],
          } as never,
        ]}
      />,
    );

    expect(screen.getByText("Braids GH")).toBeInTheDocument();
    expect(screen.queryByText("Braids NG")).not.toBeInTheDocument();
    expect(screen.getByText("Unmapped Service")).toBeInTheDocument();
  });
});
