import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
}

interface Account {
  id: string;
  userId: string;
  accountNumber: string;
  balance: number;
  accountType: string;
}

interface Transaction {
  id: string;
  accountId: string;
  type: string; // DEPOSIT, WITHDRAWAL, TRANSFER_OUT, TRANSFER_IN
  amount: number;
  status: string; // SUCCESS, FAILED
  createdDate: string;
  description?: string;
}

// In-memory Database
let users: User[] = [
  {
    id: "user-1",
    firstName: "Sarah",
    lastName: "Connor",
    email: "sarah@simplebank.com",
    password: "password123",
  },
  {
    id: "user-2",
    firstName: "John",
    lastName: "Connor",
    email: "john@simplebank.com",
    password: "password123",
  }
];

let accounts: Account[] = [
  {
    id: "acc-1",
    userId: "user-1",
    accountNumber: "SB-100200300",
    balance: 5420.50,
    accountType: "CHECKING",
  },
  {
    id: "acc-2",
    userId: "user-2",
    accountNumber: "SB-500600700",
    balance: 1250.00,
    accountType: "CHECKING",
  }
];

let transactions: Transaction[] = [
  {
    id: "tx-1",
    accountId: "acc-1",
    type: "DEPOSIT",
    amount: 5000.00,
    status: "SUCCESS",
    createdDate: "2026-07-01T14:30:00.000Z",
    description: "Initial Deposit",
  },
  {
    id: "tx-2",
    accountId: "acc-1",
    type: "DEPOSIT",
    amount: 620.50,
    status: "SUCCESS",
    createdDate: "2026-07-05T09:15:00.000Z",
    description: "Salary Transfer",
  },
  {
    id: "tx-3",
    accountId: "acc-1",
    type: "TRANSFER_OUT",
    amount: 200.00,
    status: "SUCCESS",
    createdDate: "2026-07-10T11:45:00.000Z",
    description: "Transfer to SB-500600700",
  },
  {
    id: "tx-4",
    accountId: "acc-2",
    type: "DEPOSIT",
    amount: 1050.00,
    status: "SUCCESS",
    createdDate: "2026-07-02T10:00:00.000Z",
    description: "Cash Deposit",
  },
  {
    id: "tx-5",
    accountId: "acc-2",
    type: "TRANSFER_IN",
    amount: 200.00,
    status: "SUCCESS",
    createdDate: "2026-07-10T11:45:00.000Z",
    description: "Transfer from SB-100200300",
  }
];

async function startServer() {
  const app = express();
  app.use(express.json());

  const USER_SERVICE_URL = process.env.USER_SERVICE_URL || "http://localhost:8081";
  const ACCOUNT_SERVICE_URL = process.env.ACCOUNT_SERVICE_URL || "http://localhost:8082";
  const TRANSACTION_SERVICE_URL = process.env.TRANSACTION_SERVICE_URL || "http://localhost:8083";

  const sanitizeHeaders = (headers: Record<string, any>) => {
    const cleaned: Record<string, string | string[]> = {};
    for (const [headerName, headerValue] of Object.entries(headers)) {
      if (headerName.toLowerCase() === "host") continue;
      if (headerValue !== undefined) {
        cleaned[headerName] = headerValue as string | string[];
      }
    }
    return cleaned;
  };

  const proxyRequest = async (
    baseUrl: string,
    req: express.Request,
    res: express.Response,
    overridePath?: string
  ) => {
    const url = new URL(overridePath ?? req.originalUrl, baseUrl);
    const headers = sanitizeHeaders(req.headers);
    const init: RequestInit = {
      method: req.method,
      headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD" && req.body !== undefined) {
      init.body = JSON.stringify(req.body);
      init.headers = {
        ...init.headers,
        "content-type": "application/json",
      };
    }

    const upstreamResponse = await fetch(url.toString(), init);
    res.status(upstreamResponse.status);
    upstreamResponse.headers.forEach((value, name) => {
      if (["transfer-encoding", "content-encoding", "content-length"].includes(name.toLowerCase())) {
        return;
      }
      res.setHeader(name, value);
    });

    const body = await upstreamResponse.text();
    if (body) {
      res.send(body);
    } else {
      res.end();
    }
  };

  app.post("/api/users/login", async (req, res) => {
    try {
      const loginResponse = await fetch(new URL("/api/users/login", USER_SERVICE_URL).toString(), {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(req.body),
      });

      if (!loginResponse.ok) {
        const errorText = await loginResponse.text();
        return res.status(loginResponse.status).send(errorText);
      }

      const user = await loginResponse.json();
      const accountsResponse = await fetch(
        new URL(`/api/accounts/user/${user.id}`, ACCOUNT_SERVICE_URL).toString()
      );
      const accounts = await accountsResponse.json();
      const { password, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, accounts });
    } catch (err) {
      console.error("Login proxy error:", err);
      res.status(500).json({ message: "Login gateway failure" });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const { firstName, lastName, email, password } = req.body;
      if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ message: "All fields are required" });
      }

      const createUserResponse = await fetch(new URL("/api/users", USER_SERVICE_URL).toString(), {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ firstName, lastName, email, password }),
      });

      if (!createUserResponse.ok) {
        const errorText = await createUserResponse.text();
        return res.status(createUserResponse.status).send(errorText);
      }

      const user = await createUserResponse.json();
      const createAccountResponse = await fetch(new URL("/api/accounts", ACCOUNT_SERVICE_URL).toString(), {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ userId: user.id, accountType: "CHECKING" }),
      });

      if (!createAccountResponse.ok) {
        const errorText = await createAccountResponse.text();
        return res.status(createAccountResponse.status).send(errorText);
      }

      const account = await createAccountResponse.json();
      const depositResponse = await fetch(new URL("/api/transactions/deposit", TRANSACTION_SERVICE_URL).toString(), {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ accountId: account.id, amount: 1000 }),
      });

      if (!depositResponse.ok) {
        console.warn("Welcome deposit failed", await depositResponse.text());
      }

      const { password: _, ...userWithoutPassword } = user;
      res.status(201).json({ user: userWithoutPassword, account });
    } catch (err) {
      console.error("Registration proxy error:", err);
      res.status(500).json({ message: "Registration gateway failure" });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    await proxyRequest(USER_SERVICE_URL, req, res);
  });

  app.get("/api/users/:userId/accounts", async (req, res) => {
    await proxyRequest(ACCOUNT_SERVICE_URL, req, res, `/api/accounts/user/${req.params.userId}`);
  });

  app.use("/api/accounts", async (req, res) => {
    await proxyRequest(ACCOUNT_SERVICE_URL, req, res);
  });

  app.use("/api/transactions", async (req, res) => {
    await proxyRequest(TRANSACTION_SERVICE_URL, req, res);
  });

  // --- Serve Frontend Application ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SimpleBank Backend server running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Error starting server:", err);
});
