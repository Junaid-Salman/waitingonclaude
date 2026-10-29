import { describe, expect, test } from "vitest";
import { partyHttpUrl } from "../src/lib/party-host";

describe("partyHttpUrl", () => {
  test.each(["localhost:1999", "127.0.0.1:1999", "localhost"])("%s is plain http", (host) => {
    expect(partyHttpUrl(host)).toBe(`http://${host}`);
  });

  test.each(["waitingonclaude.user.partykit.dev", "localhost.evil.com", "notlocalhost:1999"])("%s is https", (host) => {
    expect(partyHttpUrl(host)).toBe(`https://${host}`);
  });
});
