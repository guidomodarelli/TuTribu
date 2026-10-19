/** Exercises the session-only tab reference with the real browser storage of the test environment. @module messaging-connections-tab-store-tests */
import {afterEach,describe,expect,it} from "vitest";
import {createMessagingConnectionsTabStore} from "@/lib/messaging/messaging-connections-tab-store";

describe("messaging connections tab store",()=>{
  afterEach(()=>window.sessionStorage.clear());
  it("should return the remembered tab once for the same viewer and route",()=>{
    const store=createMessagingConnectionsTabStore();
    expect(store.remember("viewer-a","academy","tests")).toBe(true);
    expect(store.take("viewer-b","academy")).toBeNull();
    expect(store.take("viewer-a","other")).toBeNull();
    expect(store.take("viewer-a","academy")).toBe("tests");
    expect(store.take("viewer-a","academy")).toBeNull();
  });
  it("should ignore an unknown stored value and keep only the tab identifier",()=>{
    const store=createMessagingConnectionsTabStore();
    store.remember("viewer-a","academy","activation");
    expect(Object.values(window.sessionStorage).join("\n")).toBe("activation");
    window.sessionStorage.setItem(Object.keys(window.sessionStorage)[0],"<script>");
    expect(store.take("viewer-a","academy")).toBeNull();
  });
});
