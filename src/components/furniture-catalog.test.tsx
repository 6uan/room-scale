import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FurnitureCatalog } from "./furniture-catalog";

/** Fills the form the way someone copying a product page would. */
async function enterProduct(
  user: ReturnType<typeof userEvent.setup>,
  fields: {
    name: string;
    width?: string;
    depth?: string;
    height?: string;
    price?: string;
    retailer?: string;
    url?: string;
  },
) {
  const form = within(screen.getByRole("region", { name: /Add a product/ }));

  await user.type(form.getByLabelText("Name"), fields.name);

  for (const [label, value] of [
    ["Width", fields.width],
    ["Depth", fields.depth],
    ["Height", fields.height],
  ] as const) {
    if (value !== undefined) {
      await user.clear(form.getByLabelText(label));
      await user.paste(value);
    }
  }

  if (fields.price !== undefined) {
    await user.clear(form.getByLabelText("Price"));
    await user.paste(fields.price);
  }
  if (fields.retailer !== undefined) {
    await user.type(form.getByLabelText("Retailer"), fields.retailer);
  }
  if (fields.url !== undefined) {
    await user.type(form.getByLabelText("Product link"), fields.url);
  }

  await user.click(screen.getByRole("button", { name: "Add product" }));
}

function catalogue() {
  return within(screen.getByRole("region", { name: "Catalogue" }));
}

/** Scoped to the table, so the running total is not mistaken for a row. */
function row(name: RegExp) {
  return within(catalogue().getByRole("row", { name }));
}

describe("FurnitureCatalog", () => {
  it("starts empty", () => {
    render(<FurnitureCatalog />);

    expect(catalogue().getByText(/Nothing yet/)).toBeInTheDocument();
    expect(catalogue().queryByRole("table")).not.toBeInTheDocument();
  });

  it("adds a product copied off its page, with the price in dollars", async () => {
    const user = userEvent.setup();
    render(<FurnitureCatalog />);

    await enterProduct(user, {
      name: "L-shaped sectional",
      width: "112",
      depth: "65",
      height: "34",
      price: "1999.00",
      retailer: "Article",
      url: "https://www.article.com/product/1234",
    });

    const sectional = row(/sectional/);
    expect(sectional.getByText("$1,999.00")).toBeInTheDocument();
    expect(
      sectional.getByText(`9' 4.0" × 5' 5.0" × 2' 10.0"`),
    ).toBeInTheDocument();
    expect(sectional.getByText("Article")).toBeInTheDocument();
    expect(
      sectional.getByRole("link", {
        name: /Open L-shaped sectional product page/,
      }),
    ).toHaveAttribute("href", "https://www.article.com/product/1234");
  });

  it("refuses a product with no name, and keeps what was typed", async () => {
    const user = userEvent.setup();
    render(<FurnitureCatalog />);

    const form = within(screen.getByRole("region", { name: /Add a product/ }));
    await user.clear(form.getByLabelText("Width"));
    await user.paste("40");
    await user.click(screen.getByRole("button", { name: "Add product" }));

    expect(form.getByLabelText("Name")).toBeInvalid();
    expect(
      form.getByText("Give it a name you will recognize in a list."),
    ).toBeInTheDocument();
    expect(catalogue().getByText(/Nothing yet/)).toBeInTheDocument();
    // The width survived the rejected save.
    expect(form.getByLabelText("Width")).toHaveValue(40);
  });

  it("stays quiet about problems until the first save attempt", () => {
    render(<FurnitureCatalog />);

    const form = within(screen.getByRole("region", { name: /Add a product/ }));
    expect(form.getByLabelText("Name")).not.toBeInvalid();
    expect(
      form.queryByText("Give it a name you will recognize in a list."),
    ).not.toBeInTheDocument();
  });

  it("rejects a link that is not a web address", async () => {
    const user = userEvent.setup();
    render(<FurnitureCatalog />);

    await enterProduct(user, { name: "Arc lamp", url: "article.com/lamp" });

    expect(
      screen.getByText("Paste the full address, starting with https://."),
    ).toBeInTheDocument();
    expect(catalogue().queryByRole("table")).not.toBeInTheDocument();
  });

  it("counts and totals the catalogue, one of each", async () => {
    const user = userEvent.setup();
    render(<FurnitureCatalog />);

    await enterProduct(user, { name: "Rug", price: "349.00" });
    await enterProduct(user, { name: "Arc lamp", price: "189.99" });

    expect(screen.getByText(/2 products/)).toBeInTheDocument();
    expect(screen.getByText("$538.99")).toBeInTheDocument();
  });

  it("edits a product in place", async () => {
    const user = userEvent.setup();
    render(<FurnitureCatalog />);

    await enterProduct(user, { name: "Coffee table", price: "249.00" });
    await user.click(screen.getByRole("button", { name: "Edit Coffee table" }));

    const form = within(
      screen.getByRole("region", { name: /Edit Coffee table/ }),
    );
    await user.clear(form.getByLabelText("Price"));
    await user.paste("199.00");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(row(/Coffee table/).getByText("$199.00")).toBeInTheDocument();
    expect(row(/Coffee table/).queryByText("$249.00")).not.toBeInTheDocument();
    // One product, edited — not a second one added. Two rows: header and it.
    expect(catalogue().getAllByRole("row")).toHaveLength(2);
  });

  it("abandons an edit on cancel", async () => {
    const user = userEvent.setup();
    render(<FurnitureCatalog />);

    await enterProduct(user, { name: "Coffee table", price: "249.00" });
    await user.click(screen.getByRole("button", { name: "Edit Coffee table" }));

    const form = within(
      screen.getByRole("region", { name: /Edit Coffee table/ }),
    );
    await user.clear(form.getByLabelText("Price"));
    await user.paste("1.00");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(row(/Coffee table/).getByText("$249.00")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /Add a product/ }),
    ).toBeInTheDocument();
  });

  it("removes a product", async () => {
    const user = userEvent.setup();
    render(<FurnitureCatalog />);

    await enterProduct(user, { name: "Olive tree", price: "129.00" });
    await user.click(screen.getByRole("button", { name: "Remove Olive tree" }));

    expect(catalogue().getByText(/Nothing yet/)).toBeInTheDocument();
  });

  it("shows dimensions in the chosen unit without changing them", async () => {
    const user = userEvent.setup();
    render(<FurnitureCatalog />);

    await enterProduct(user, { name: "Rug", width: "96", depth: "60" });
    await user.click(screen.getByLabelText("Centimeters"));

    expect(row(/Rug/).getByText(/243\.8 cm × 152\.4 cm/)).toBeInTheDocument();
  });
});
