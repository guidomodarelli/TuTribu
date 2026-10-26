/** Exercises native request origins, including the configured public origin behind a loopback proxy. */
import {afterEach,describe,expect,it,vi} from "vitest";
import {hasAllowedRequestOrigin} from "@/src/modules/shared/infrastructure/http/has-allowed-request-origin";

afterEach(()=>vi.unstubAllEnvs());

describe("native request origin authorization",()=>{
  it.each([
    ["https://localhost:4453/action","127.0.0.1:4453"],
    ["http://localhost:4453/action","127.0.0.1:4453"],
    ["http://127.0.0.1:4453/action","localhost:4453"],
    ["http://[::1]:4453/action","[::1]:4453"],
  ])("should accept the configured public browser origin through the loopback proxy at %s",(url,host)=>{
    vi.stubEnv("BETTER_AUTH_URL","https://dev-tutribu.app");
    const request=new Request(url,{headers:{origin:"https://dev-tutribu.app",host}});
    expect(hasAllowedRequestOrigin(request)).toBe(true);
  });

  it.each([
    {origin:"https://foreign.example",host:"127.0.0.1:4453",url:"http://localhost:4453/action"},
    {origin:"http://dev-tutribu.app",host:"127.0.0.1:4453",url:"http://localhost:4453/action"},
    {origin:"https://dev-tutribu.app:444",host:"127.0.0.1:4453",url:"http://localhost:4453/action"},
    {origin:"https://dev-tutribu.app/path",host:"127.0.0.1:4453",url:"http://localhost:4453/action"},
    {origin:"https://dev-tutribu.app",host:"foreign.example",url:"http://localhost:4453/action"},
    {origin:"https://dev-tutribu.app",host:"127.0.0.1:4454",url:"http://localhost:4453/action"},
    {origin:"https://dev-tutribu.app",host:"127.0.0.1:4453",url:"https://foreign.example/action"},
    {origin:"null",host:"127.0.0.1:4453",url:"http://localhost:4453/action"},
  ])("should reject an unapproved or crossed proxy origin $origin at $url",({origin,host,url})=>{
    vi.stubEnv("BETTER_AUTH_URL","https://dev-tutribu.app");
    expect(hasAllowedRequestOrigin(new Request(url,{headers:{origin,host,"x-forwarded-host":"dev-tutribu.app","x-forwarded-proto":"https"}}))).toBe(false);
  });

  it.each(["","not-an-origin","ftp://dev-tutribu.app"])("should require usable public configuration for a proxy exception %s",(configuration)=>{
    vi.stubEnv("BETTER_AUTH_URL",configuration);
    expect(hasAllowedRequestOrigin(new Request("http://localhost:4453/action",{headers:{origin:"https://dev-tutribu.app",host:"127.0.0.1:4453"}}))).toBe(false);
  });

  it("should retain direct same-origin and nonbrowser requests without public configuration",()=>{
    vi.stubEnv("BETTER_AUTH_URL","");
    expect(hasAllowedRequestOrigin(new Request("https://tutribu.app/action",{headers:{origin:"https://tutribu.app",host:"tutribu.app"}}))).toBe(true);
    expect(hasAllowedRequestOrigin(new Request("http://localhost:4453/action"))).toBe(true);
    expect(hasAllowedRequestOrigin(new Request("https://tutribu.app/action",{headers:{origin:"https://foreign.example",host:"tutribu.app"}}))).toBe(false);
  });
});
