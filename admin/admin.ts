require("dotenv").config();

import type { OcppCall } from "../src/ocppMessage";

const adminPort = process.env.ADMIN_PORT ?? "9999";

// biome-ignore lint/suspicious/noExplicitAny: ocpp types
export const sendAdminCommand = async (command: OcppCall<any>) => {
  let res: Response;
  try {
    res = await fetch(`http://localhost:${adminPort}/execute`, {
      method: "POST",
      body: JSON.stringify({
        action: command.action,
        payload: command.payload,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch {
    console.error(
      `VCP admin not reachable on port ${adminPort}. Run "npm run plug2" first.`,
    );
    process.exit(1);
  }

  if (!res.ok) {
    const body = await res.text();
    console.error(
      `Admin command failed (HTTP ${res.status}): ${body || res.statusText}`,
    );
    process.exit(1);
  }
};
