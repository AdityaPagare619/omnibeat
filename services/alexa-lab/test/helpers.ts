import net from "node:net";

/**
 * Reserve a TCP port, then close it: connecting to it afterwards fails with
 * ECONNREFUSED immediately — the honest "MCP OFFLINE" fixture for tests.
 */
export async function deadPortUrl(pathname = "/mcp"): Promise<string> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return `http://127.0.0.1:${port}${pathname}`;
}

export function originOf(url: string): string {
  return new URL(url).origin;
}
