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

  // --- API Routes ---

  // Auth/Login Routes
  app.post("/api/login", (req, res) => {
    const { email, password } = req.body;
    const user = users.find((u) => u.email === email && u.password === password);
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    // Find associated accounts
    const userAccounts = accounts.filter((a) => a.userId === user.id);
    const { password: _, ...userWithoutPassword } = user;
    res.json({
      user: userWithoutPassword,
      accounts: userAccounts,
    });
  });

  app.post("/api/users/login", (req, res) => {
    const { email, password } = req.body;
    const user = users.find((u) => u.email === email && u.password === password);
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const userAccounts = accounts.filter((a) => a.userId === user.id);
    const { password: _, ...userWithoutPassword } = user;
    res.json({
      user: userWithoutPassword,
      accounts: userAccounts,
    });
  });

  // Users Endpoints
  app.post("/api/users", (req, res) => {
    const { firstName, lastName, email, password } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }
    if (users.some((u) => u.email === email)) {
      return res.status(400).json({ message: "Email already exists" });
    }
    const newUser: User = {
      id: `user-${Date.now()}`,
      firstName,
      lastName,
      email,
      password,
    };
    users.push(newUser);

    // Auto-create a checking account for the new user
    const newAccount: Account = {
      id: `acc-${Date.now()}`,
      userId: newUser.id,
      accountNumber: `SB-${Math.floor(100000000 + Math.random() * 900000000)}`,
      balance: 1000.00, // Gift of $1000 to new users!
      accountType: "CHECKING",
    };
    accounts.push(newAccount);

    // Add initial deposit transaction
    transactions.push({
      id: `tx-${Date.now()}`,
      accountId: newAccount.id,
      type: "DEPOSIT",
      amount: 1000.00,
      status: "SUCCESS",
      createdDate: new Date().toISOString(),
      description: "Welcome Bonus Deposit",
    });

    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json({
      user: userWithoutPassword,
      account: newAccount,
    });
  });

  app.get("/api/users/:id", (req, res) => {
    const user = users.find((u) => u.id === req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const { password: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  });

  // Accounts Endpoints
  app.post("/api/accounts", (req, res) => {
    const { userId, accountType } = req.body;
    if (!userId || !accountType) {
      return res.status(400).json({ message: "userId and accountType are required" });
    }
    const user = users.find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const newAccount: Account = {
      id: `acc-${Date.now()}`,
      userId,
      accountNumber: `SB-${Math.floor(100000000 + Math.random() * 900000000)}`,
      balance: 0.00,
      accountType: accountType.toUpperCase(),
    };
    accounts.push(newAccount);
    res.status(201).json(newAccount);
  });

  app.get("/api/accounts/:id", (req, res) => {
    const account = accounts.find((a) => a.id === req.params.id);
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }
    res.json(account);
  });

  app.get("/api/accounts/:id/balance", (req, res) => {
    const account = accounts.find((a) => a.id === req.params.id);
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }
    res.json({ balance: account.balance });
  });

  // Transactions Endpoints
  app.post("/api/transactions/deposit", (req, res) => {
    const { accountId, amount } = req.body;
    if (!accountId || amount === undefined || amount <= 0) {
      return res.status(400).json({ message: "Valid accountId and positive amount are required" });
    }
    const account = accounts.find((a) => a.id === accountId);
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    account.balance += Number(amount);
    const newTx: Transaction = {
      id: `tx-${Date.now()}`,
      accountId,
      type: "DEPOSIT",
      amount: Number(amount),
      status: "SUCCESS",
      createdDate: new Date().toISOString(),
      description: "Direct Deposit",
    };
    transactions.push(newTx);
    res.status(201).json(newTx);
  });

  app.post("/api/transactions/transfer", (req, res) => {
    const { sourceAccountId, receiverAccountNumber, amount } = req.body;
    if (!sourceAccountId || !receiverAccountNumber || amount === undefined || amount <= 0) {
      return res.status(400).json({ message: "All fields are required and amount must be positive" });
    }

    const sourceAccount = accounts.find((a) => a.id === sourceAccountId);
    if (!sourceAccount) {
      return res.status(404).json({ message: "Source account not found" });
    }

    // Try finding the destination account by account number or ID
    const targetAccount = accounts.find(
      (a) => a.accountNumber === receiverAccountNumber || a.id === receiverAccountNumber
    );

    if (!targetAccount) {
      // Create a FAILED transaction record for source account
      const failedTx: Transaction = {
        id: `tx-${Date.now()}`,
        accountId: sourceAccountId,
        type: "TRANSFER_OUT",
        amount: Number(amount),
        status: "FAILED",
        createdDate: new Date().toISOString(),
        description: `Failed transfer: Receiver account ${receiverAccountNumber} not found`,
      };
      transactions.push(failedTx);
      return res.status(404).json({ message: "Receiver account not found", tx: failedTx });
    }

    if (sourceAccount.id === targetAccount.id) {
      return res.status(400).json({ message: "Cannot transfer to the same account" });
    }

    if (sourceAccount.balance < amount) {
      const failedTx: Transaction = {
        id: `tx-${Date.now()}`,
        accountId: sourceAccountId,
        type: "TRANSFER_OUT",
        amount: Number(amount),
        status: "FAILED",
        createdDate: new Date().toISOString(),
        description: `Insufficient funds for transfer to ${targetAccount.accountNumber}`,
      };
      transactions.push(failedTx);
      return res.status(400).json({ message: "Insufficient balance", tx: failedTx });
    }

    // Execute transfer
    sourceAccount.balance -= Number(amount);
    targetAccount.balance += Number(amount);

    const timestamp = new Date().toISOString();

    const senderTx: Transaction = {
      id: `tx-${Date.now()}-out`,
      accountId: sourceAccount.id,
      type: "TRANSFER_OUT",
      amount: Number(amount),
      status: "SUCCESS",
      createdDate: timestamp,
      description: `Transfer to ${targetAccount.accountNumber}`,
    };

    const receiverTx: Transaction = {
      id: `tx-${Date.now()}-in`,
      accountId: targetAccount.id,
      type: "TRANSFER_IN",
      amount: Number(amount),
      status: "SUCCESS",
      createdDate: timestamp,
      description: `Transfer from ${sourceAccount.accountNumber}`,
    };

    transactions.push(senderTx);
    transactions.push(receiverTx);

    res.status(201).json({
      message: "Transfer completed successfully",
      sourceAccount,
      transaction: senderTx,
    });
  });

  app.get("/api/transactions/:accountId", (req, res) => {
    const accountTx = transactions.filter((t) => t.accountId === req.params.accountId);
    // Sort transactions by date descending (most recent first)
    accountTx.sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime());
    res.json(accountTx);
  });

  // Get active accounts for a user (helper endpoint)
  app.get("/api/users/:userId/accounts", (req, res) => {
    const userAccounts = accounts.filter((a) => a.userId === req.params.userId);
    res.json(userAccounts);
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
