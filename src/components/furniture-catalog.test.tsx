import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { resetProjectStore } from "@/state/project-store";
import { FurnitureCatalog } from "./furniture-catalog";

// The project store is module-level, so it outlives a single test.
beforeEach(resetProjectStore);

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

describe("filling a product in from a pasted page", () => {
  /** Shaped like the Amazon sectional page as a person would paste it. */
  const PASTED = [
    "Skip to main content",
    "Belffin Modular Sectional Sleeper Sofa Bed with Storage Chaise",
    "$949.99",
    "Item Dimensions 52.8 x 125.8 x 36.4 inches",
  ].join("\n");

  async function paste(
    user: ReturnType<typeof userEvent.setup>,
    text: string,
  ): Promise<void> {
    await user.click(screen.getByText("Paste from a product page"));
    await user.click(screen.getByRole("textbox", { name: /select all of it/ }));
    await user.paste(text);
    await user.click(screen.getByRole("button", { name: "Fill the form" }));
  }

  it("fills the form from the page, leaving it to be checked and saved", async () => {
    const user = userEvent.setup();
    render(<FurnitureCatalog />);

    await paste(user, PASTED);

    const form = within(screen.getByRole("region", { name: /Add a product/ }));
    expect(form.getByLabelText("Name")).toHaveValue(
      "Belffin Modular Sectional Sleeper Sofa Bed with Storage Chaise",
    );
    expect(form.getByLabelText("Price")).toHaveValue("949.99");
    expect(form.getByLabelText("Height")).toHaveValue(36.4);
    // Nothing is saved until the form is submitted as normal.
    expect(catalogue().getByText(/Nothing yet/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add product" }));
    expect(row(/Belffin/).getByText("$949.99")).toBeInTheDocument();
  });

  it("says where each value came from", async () => {
    const user = userEvent.setup();
    render(<FurnitureCatalog />);

    await paste(user, PASTED);

    const report = within(screen.getByRole("status"));
    expect(screen.getByRole("status")).toHaveTextContent("Read 5 values");
    // Twice over for the price: once as the value, once as the text it came
    // from, which for a price are the same characters.
    expect(report.getAllByText("$949.99")).toHaveLength(2);
    // The three sizes all point back at the one line they were read from.
    expect(report.getAllByText("52.8 x 125.8 x 36.4 inches")).toHaveLength(3);
  });

  it("warns when the page never said which size was which", async () => {
    const user = userEvent.setup();
    render(<FurnitureCatalog />);

    await paste(user, PASTED);

    expect(
      screen.getByText(/listed three sizes without saying which was which/),
    ).toBeInTheDocument();
  });

  it("stays quiet about the order when the page labelled its axes", async () => {
    const user = userEvent.setup();
    render(<FurnitureCatalog />);

    await paste(
      user,
      ['AMERLIFE 70" Modern TV Stand', '70"W x 15.7"D x 20.5"H'].join("\n"),
    );

    const form = within(screen.getByRole("region", { name: /Add a product/ }));
    expect(form.getByLabelText("Width")).toHaveValue(70);
    expect(form.getByLabelText("Depth")).toHaveValue(15.7);
    expect(
      screen.queryByText(/without saying which was which/),
    ).not.toBeInTheDocument();
  });

  it("says so rather than inventing anything when it can read nothing", async () => {
    const user = userEvent.setup();
    render(<FurnitureCatalog />);

    await paste(user, "$$$ ??? ---");

    expect(screen.getByRole("status")).toHaveTextContent(
      /Nothing could be read/,
    );
    expect(
      within(
        screen.getByRole("region", { name: /Add a product/ }),
      ).getByLabelText("Name"),
    ).toHaveValue("");
  });
});
