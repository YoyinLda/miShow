import { describe, expect, it } from "vitest";
import { PersistenceError, recordVenueSourceChecks, type RpcRequest } from "../src/index.js";

describe("recordVenueSourceChecks", () => {
  it("llama la RPC con p_source y p_checks", async () => {
    const calls: RpcRequest[] = [];
    await recordVenueSourceChecks("puntoticket", [{ source_slug: "a", status: "active" }, { source_slug: "b", status: "not_found" }], async (r) => {
      calls.push(r);
      return 2;
    });
    expect(calls).toEqual([
      {
        functionName: "record_venue_source_checks",
        parameters: { p_source: "puntoticket", p_checks: [{ source_slug: "a", status: "active" }, { source_slug: "b", status: "not_found" }] }
      }
    ]);
  });

  it("no llama la RPC sin checks y valida la forma", async () => {
    let n = 0;
    await recordVenueSourceChecks("puntoticket", [], async () => { n++; });
    expect(n).toBe(0);
    await expect(recordVenueSourceChecks("puntoticket", [{ source_slug: "a", status: "candidate" as never }], async () => {})).rejects.toBeInstanceOf(PersistenceError);
    await expect(recordVenueSourceChecks(" ", [], async () => {})).rejects.toBeInstanceOf(PersistenceError);
  });
});
