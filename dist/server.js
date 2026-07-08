// server.js
import express from "express";
import http from "http";
import path2 from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import bcrypt2 from "bcryptjs";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

// src/dbService.js
import { MongoClient, ObjectId } from "mongodb";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
var MONGO_URI = process.env.MONGODB_URI || "mongodb+srv://itsnexverra_db_user:HxIDUx9DfihUpbOy@cluster0.rhkonwx.mongodb.net/?appName=Cluster0";
var DB_NAME = "trainingstudio";
var JSON_DB_PATH = path.join(process.cwd(), "db.json");
var mongoClient = null;
var mongoDb = null;
var useMongo = false;
var localData = {
  users: [],
  messages: [],
  contacts: []
};
function generateId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
function loadLocalDb() {
  try {
    if (fs.existsSync(JSON_DB_PATH)) {
      const content = fs.readFileSync(JSON_DB_PATH, "utf8");
      localData = JSON.parse(content);
      if (!localData.users) localData.users = [];
      if (!localData.messages) localData.messages = [];
      if (!localData.contacts) localData.contacts = [];
    } else {
      saveLocalDb();
    }
  } catch (err) {
    console.error("Failed to load local JSON DB:", err);
  }
}
function saveLocalDb() {
  try {
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localData, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to save local JSON DB:", err);
  }
}
async function initDb() {
  loadLocalDb();
  try {
    console.log(`Attempting to connect to MongoDB at: ${MONGO_URI}...`);
    mongoClient = new MongoClient(MONGO_URI, { connectTimeoutMS: 4e3, serverSelectionTimeoutMS: 4e3 });
    await mongoClient.connect();
    mongoDb = mongoClient.db(DB_NAME);
    useMongo = true;
    console.log("Successfully connected to MongoDB! All operations will use MongoDB.");
  } catch (error) {
    console.warn("MongoDB connection failed. Falling back to robust local file-based database (db.json).");
    useMongo = false;
  }
  const adminEmail = "admin@trainingstudio.com";
  const existingAdmin = await getUserByEmail(adminEmail);
  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash("admin123", 10);
    const defaultAdmin = {
      _id: useMongo ? "" : generateId(),
      name: "System Admin",
      email: adminEmail,
      password: hashedPassword,
      role: "admin",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (useMongo && mongoDb) {
      delete defaultAdmin._id;
      await mongoDb.collection("users").insertOne(defaultAdmin);
      console.log("Seeded default admin to MongoDB.");
    } else {
      localData.users.push(defaultAdmin);
      saveLocalDb();
      console.log("Seeded default admin to local JSON database.");
    }
  } else {
    console.log("Default admin account already exists.");
  }
}
async function getUserByEmail(email) {
  if (!email) return null;
  const normalizedEmail = email.toLowerCase().trim();
  if (useMongo && mongoDb) {
    const user = await mongoDb.collection("users").findOne({ email: normalizedEmail });
    if (!user) return null;
    return {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      password: user.password,
      role: user.role,
      createdAt: user.createdAt,
      enrolledClass: user.enrolledClass,
      contactSubject: user.contactSubject
    };
  } else {
    const user = localData.users.find((u) => u.email.toLowerCase() === normalizedEmail);
    return user ? { ...user } : null;
  }
}
async function getUserById(id) {
  if (!id) return null;
  if (useMongo && mongoDb) {
    try {
      const user = await mongoDb.collection("users").findOne({ _id: new ObjectId(id) });
      if (!user) return null;
      return {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        password: user.password,
        role: user.role,
        createdAt: user.createdAt,
        enrolledClass: user.enrolledClass,
        contactSubject: user.contactSubject
      };
    } catch {
      const user = await mongoDb.collection("users").findOne({ _id: id });
      if (!user) return null;
      return {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        password: user.password,
        role: user.role,
        createdAt: user.createdAt,
        enrolledClass: user.enrolledClass,
        contactSubject: user.contactSubject
      };
    }
  } else {
    const user = localData.users.find((u) => u._id === id);
    return user ? { ...user } : null;
  }
}
async function createUser(user) {
  const normalizedEmail = user.email.toLowerCase().trim();
  const newUser = {
    ...user,
    email: normalizedEmail,
    createdAt: user.createdAt || (/* @__PURE__ */ new Date()).toISOString()
  };
  if (useMongo && mongoDb) {
    const result = await mongoDb.collection("users").insertOne(newUser);
    return {
      ...newUser,
      _id: result.insertedId.toString()
    };
  } else {
    const dbUser = {
      ...newUser,
      _id: generateId()
    };
    localData.users.push(dbUser);
    saveLocalDb();
    return dbUser;
  }
}
async function updateUser(id, updates) {
  if (useMongo && mongoDb) {
    try {
      const filter = { _id: new ObjectId(id) };
      await mongoDb.collection("users").updateOne(filter, { $set: updates });
      return await getUserById(id);
    } catch {
      await mongoDb.collection("users").updateOne({ _id: id }, { $set: updates });
      return await getUserById(id);
    }
  } else {
    const idx = localData.users.findIndex((u) => u._id === id);
    if (idx === -1) return null;
    localData.users[idx] = {
      ...localData.users[idx],
      ...updates
    };
    saveLocalDb();
    return { ...localData.users[idx] };
  }
}
async function deleteUser(id) {
  const cleanId = id ? id.toString().trim() : "";
  console.log(`[DB] deleteUser called with id: "${id}", cleaned: "${cleanId}", useMongo: ${useMongo}`);
  if (useMongo && mongoDb) {
    try {
      console.log(`[DB] Attempting MongoDB delete with ObjectId for id: ${cleanId}`);
      const result = await mongoDb.collection("users").deleteOne({ _id: new ObjectId(cleanId) });
      console.log(`[DB] MongoDB delete by ObjectId result: deletedCount = ${result.deletedCount}`);
      if (result.deletedCount > 0) return true;
    } catch (err) {
      console.warn(`[DB] MongoDB delete by ObjectId failed, error: ${err.message}. Retrying with string _id...`);
    }
    try {
      const result = await mongoDb.collection("users").deleteOne({ _id: cleanId });
      console.log(`[DB] MongoDB delete by string _id result: deletedCount = ${result.deletedCount}`);
      return result.deletedCount > 0;
    } catch (err) {
      console.error(`[DB] MongoDB delete by string _id failed, error: ${err.message}`);
      return false;
    }
  } else {
    console.log(`[DB] Attempting local JSON delete. Current users count: ${localData.users.length}`);
    const idx = localData.users.findIndex((u) => {
      const uId = u._id ? u._id.toString().trim() : "";
      return uId === cleanId;
    });
    console.log(`[DB] Found local user index: ${idx}`);
    if (idx === -1) {
      console.warn(`[DB] Local user with ID "${cleanId}" not found. Available IDs:`, localData.users.map((u) => u._id));
      return false;
    }
    const deletedUser = localData.users.splice(idx, 1);
    console.log(`[DB] Successfully spliced user "${deletedUser[0].name}" from local array.`);
    saveLocalDb();
    return true;
  }
}
async function getAllUsers() {
  if (useMongo && mongoDb) {
    const users = await mongoDb.collection("users").find({}).toArray();
    return users.map((user) => ({
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      enrolledClass: user.enrolledClass,
      contactSubject: user.contactSubject
    }));
  } else {
    return localData.users.map((u) => ({ ...u, password: void 0 }));
  }
}
async function createChatMessage(msg) {
  const newMsg = {
    ...msg,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (useMongo && mongoDb) {
    const result = await mongoDb.collection("messages").insertOne(newMsg);
    return {
      ...newMsg,
      _id: result.insertedId.toString()
    };
  } else {
    const dbMsg = {
      ...newMsg,
      _id: generateId()
    };
    localData.messages.push(dbMsg);
    saveLocalDb();
    return dbMsg;
  }
}
async function getChatHistory(userId) {
  if (useMongo && mongoDb) {
    const query = {
      $or: [
        { senderId: userId },
        { receiverId: userId },
        { senderId: "admin", receiverId: userId }
      ]
    };
    const messages = await mongoDb.collection("messages").find(query).sort({ timestamp: 1 }).toArray();
    return messages.map((msg) => ({
      _id: msg._id.toString(),
      senderId: msg.senderId,
      senderName: msg.senderName,
      senderRole: msg.senderRole,
      receiverId: msg.receiverId,
      text: msg.text,
      timestamp: msg.timestamp
    }));
  } else {
    return localData.messages.filter((m) => m.senderId === userId || m.receiverId === userId).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }
}
async function getAllConversations() {
  let allMessages = [];
  if (useMongo && mongoDb) {
    allMessages = (await mongoDb.collection("messages").find({}).sort({ timestamp: 1 }).toArray()).map((msg) => ({
      _id: msg._id.toString(),
      senderId: msg.senderId,
      senderName: msg.senderName,
      senderRole: msg.senderRole,
      receiverId: msg.receiverId,
      text: msg.text,
      timestamp: msg.timestamp
    }));
  } else {
    allMessages = [...localData.messages];
  }
  const convos = {};
  allMessages.forEach((m) => {
    const isSenderAdmin = m.senderRole === "admin" || m.senderId === "admin";
    const userId = isSenderAdmin ? m.receiverId : m.senderId;
    const userName = isSenderAdmin ? "User" : m.senderName;
    if (userId === "admin") return;
    if (!convos[userId] || new Date(m.timestamp).getTime() > new Date(convos[userId].timestamp).getTime()) {
      convos[userId] = {
        userName: isSenderAdmin ? convos[userId]?.userName || userName : m.senderName,
        lastMessage: m.text,
        timestamp: m.timestamp
      };
    }
  });
  return Object.keys(convos).map((userId) => ({
    userId,
    userName: convos[userId].userName,
    lastMessage: convos[userId].lastMessage,
    timestamp: convos[userId].timestamp
  })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
async function deleteChatThread(userId) {
  const cleanUserId = userId ? userId.toString().trim() : "";
  console.log(`[DB] deleteChatThread called for userId: "${userId}", cleaned: "${cleanUserId}", useMongo: ${useMongo}`);
  if (useMongo && mongoDb) {
    const result = await mongoDb.collection("messages").deleteMany({
      $or: [
        { senderId: cleanUserId },
        { receiverId: cleanUserId }
      ]
    });
    console.log(`[DB] MongoDB delete messages count: ${result.deletedCount}`);
    return result.deletedCount > 0;
  } else {
    const initialLen = localData.messages.length;
    localData.messages = localData.messages.filter((m) => {
      const sId = m.senderId ? m.senderId.toString().trim() : "";
      const rId = m.receiverId ? m.receiverId.toString().trim() : "";
      return sId !== cleanUserId && rId !== cleanUserId;
    });
    console.log(`[DB] Local JSON delete messages. Pre count: ${initialLen}, Post count: ${localData.messages.length}`);
    saveLocalDb();
    return true;
  }
}
async function createContactMessage(contact) {
  const newContact = {
    ...contact,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (useMongo && mongoDb) {
    const result = await mongoDb.collection("contacts").insertOne(newContact);
    return {
      ...newContact,
      _id: result.insertedId.toString()
    };
  } else {
    const dbContact = {
      ...newContact,
      _id: generateId()
    };
    localData.contacts.push(dbContact);
    saveLocalDb();
    return dbContact;
  }
}
async function getAllContactMessages() {
  if (useMongo && mongoDb) {
    try {
      const contacts = await mongoDb.collection("contacts").find({}).sort({ createdAt: -1 }).toArray();
      return contacts.map((c) => ({
        _id: c._id.toString(),
        name: c.name,
        email: c.email,
        subject: c.subject,
        message: c.message,
        createdAt: c.createdAt
      }));
    } catch (err) {
      console.error("Failed to fetch contact messages from MongoDB:", err);
      return [];
    }
  } else {
    return [...localData.contacts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}
async function deleteContactMessage(id) {
  const cleanId = id ? id.toString().trim() : "";
  console.log(`[DB] deleteContactMessage called with id: "${id}", cleaned: "${cleanId}", useMongo: ${useMongo}`);
  if (useMongo && mongoDb) {
    try {
      const result = await mongoDb.collection("contacts").deleteOne({ _id: new ObjectId(cleanId) });
      if (result.deletedCount > 0) return true;
    } catch (err) {
      console.warn(`[DB] deleteContactMessage by ObjectId failed: ${err.message}. Retrying with string ID...`);
    }
    try {
      const result = await mongoDb.collection("contacts").deleteOne({ _id: cleanId });
      return result.deletedCount > 0;
    } catch (err) {
      console.error(`[DB] deleteContactMessage by string ID failed: ${err.message}`);
      return false;
    }
  } else {
    const idx = localData.contacts.findIndex((c) => {
      const cId = c._id ? c._id.toString().trim() : "";
      return cId === cleanId;
    });
    if (idx === -1) return false;
    localData.contacts.splice(idx, 1);
    saveLocalDb();
    return true;
  }
}

// server.js
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
var PORT = 3e3;
var JWT_SECRET = process.env.JWT_SECRET || "training-studio-secret-key-123456";
var activeClients = /* @__PURE__ */ new Map();
async function startServer() {
  await initDb();
  const app = express();
  app.use(express.json());
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });
  wss.on("connection", (ws) => {
    console.log("New WebSocket connection established.");
    ws.on("message", async (data) => {
      try {
        const payload = JSON.parse(data);
        console.log("WebSocket received command:", payload.type, "from user:", payload.userId);
        if (payload.type === "join") {
          const { token, guestId, name } = payload;
          let userId = guestId || "guest_" + Math.random().toString(36).substring(2, 9);
          let userName = name || "Guest User";
          let role = "user";
          if (token) {
            try {
              const decoded = jwt.verify(token, JWT_SECRET);
              userId = decoded.userId;
              role = decoded.role || "user";
              const dbUser = await getUserById(userId);
              if (dbUser) {
                userName = dbUser.name;
              }
            } catch (err) {
              console.warn("Invalid token sent on join websocket. Treating as guest.");
            }
          }
          activeClients.set(ws, { ws, userId, userName, role });
          console.log(`Socket joined: ${userName} (${role}) - ID: ${userId}`);
          const history = await getChatHistory(userId);
          ws.send(JSON.stringify({
            type: "history",
            userId,
            history: history.length > 0 ? history : [
              {
                _id: "sys_welcome",
                senderId: "admin",
                senderName: "Training Studio Support",
                senderRole: "admin",
                receiverId: userId,
                text: `Hello ${userName}! Welcome to Training Studio. How can we help you achieve your physical limits today?`,
                timestamp: (/* @__PURE__ */ new Date()).toISOString()
              }
            ]
          }));
          broadcastAdminList();
        }
        if (payload.type === "message") {
          const clientInfo = activeClients.get(ws);
          if (!clientInfo) {
            ws.send(JSON.stringify({ type: "error", message: "Not authenticated/joined on socket" }));
            return;
          }
          const { text, recipientId } = payload;
          const { userId: senderId, userName: senderName, role: senderRole } = clientInfo;
          const receiverId = senderRole === "admin" ? recipientId || "user" : "admin";
          const savedMsg = await createChatMessage({
            senderId,
            senderName,
            senderRole,
            receiverId,
            text
          });
          let delivered = false;
          for (const [otherWs, otherClient] of activeClients.entries()) {
            if (senderRole === "user" && otherClient.role === "admin") {
              otherWs.send(JSON.stringify({
                type: "message",
                message: savedMsg
              }));
              delivered = true;
            } else if (senderRole === "admin" && otherClient.userId === receiverId) {
              otherWs.send(JSON.stringify({
                type: "message",
                message: savedMsg
              }));
              delivered = true;
            } else if (senderRole === "admin" && otherClient.role === "admin" && otherClient.userId !== senderId) {
              otherWs.send(JSON.stringify({
                type: "message",
                message: savedMsg
              }));
            }
          }
          ws.send(JSON.stringify({
            type: "message",
            message: savedMsg
          }));
          console.log(`Chat message saved & routed. Delivered to recipient(s): ${delivered}`);
          broadcastAdminList();
        }
      } catch (err) {
        console.error("WebSocket message processing error:", err);
      }
    });
    ws.on("close", () => {
      const clientInfo = activeClients.get(ws);
      if (clientInfo) {
        console.log(`WebSocket disconnected: ${clientInfo.userName}`);
        activeClients.delete(ws);
        broadcastAdminList();
      }
    });
  });
  async function broadcastAdminList() {
    const convos = await getAllConversations();
    for (const [otherWs, otherClient] of activeClients.entries()) {
      if (otherClient.role === "admin") {
        otherWs.send(JSON.stringify({
          type: "admin_conversations_update",
          conversations: convos,
          activeUsers: Array.from(activeClients.values()).filter((c) => c.role !== "admin").map((c) => ({ userId: c.userId, userName: c.userName }))
        }));
      }
    }
  }
  function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No authentication token provided" });
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) return res.status(403).json({ error: "Session expired or invalid token" });
      req.user = decoded;
      next();
    });
  }
  function requireAdmin(req, res, next) {
    authenticateToken(req, res, () => {
      if (req.user && req.user.role === "admin") {
        next();
      } else {
        res.status(403).json({ error: "Access denied. Administrator privileges required." });
      }
    });
  }
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { name, email, password, enrolledClass } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ error: "Name, email and password are required" });
      }
      const existing = await getUserByEmail(email);
      if (existing) {
        return res.status(400).json({ error: "Email already registered" });
      }
      const hashedPassword = await bcrypt2.hash(password, 10);
      const user = await createUser({
        name,
        email,
        password: hashedPassword,
        role: "user",
        enrolledClass: enrolledClass || "Basic Fitness"
      });
      const token = jwt.sign({ userId: user._id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
      res.status(201).json({
        token,
        user: { id: user._id, name: user.name, email: user.email, role: user.role, enrolledClass: user.enrolledClass }
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "Registration failed" });
    }
  });
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }
      const user = await getUserByEmail(email);
      if (!user || !user.password) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      const isMatch = await bcrypt2.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      const token = jwt.sign({ userId: user._id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
      res.json({
        token,
        user: { id: user._id, name: user.name, email: user.email, role: user.role, enrolledClass: user.enrolledClass }
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "Login failed" });
    }
  });
  app.get("/api/auth/me", authenticateToken, async (req, res) => {
    try {
      const user = await getUserById(req.user.userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        enrolledClass: user.enrolledClass
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/contact", async (req, res) => {
    try {
      const { name, email, subject, message } = req.body;
      if (!name || !email || !subject || !message) {
        return res.status(400).json({ error: "All fields are required" });
      }
      await createContactMessage({ name, email, subject, message });
      let user = await getUserByEmail(email);
      let accountCreated = false;
      let accountCredentials = null;
      if (!user) {
        const defaultPassword = "welcome123";
        const hashedPassword = await bcrypt2.hash(defaultPassword, 10);
        user = await createUser({
          name,
          email,
          password: hashedPassword,
          role: "user",
          enrolledClass: "Basic Fitness",
          contactSubject: subject
        });
        accountCreated = true;
        accountCredentials = { email, password: defaultPassword };
        console.log(`Automatically generated account for contact lead: ${email}`);
      }
      if (user && (user._id || user.id)) {
        const userIdStr = (user._id || user.id).toString();
        const savedMsg = await createChatMessage({
          senderId: userIdStr,
          senderName: user.name,
          senderRole: "user",
          receiverId: "admin",
          text: `[Contact Form Submission]
Subject: ${subject}
Message: ${message}`
        });
        console.log(`Auto-created live chat message for user: ${user.name} (${userIdStr})`);
        for (const [otherWs, otherClient] of activeClients.entries()) {
          if (otherClient.role === "admin") {
            try {
              otherWs.send(JSON.stringify({
                type: "message",
                message: savedMsg
              }));
              otherWs.send(JSON.stringify({
                type: "admin_inquiries_update"
              }));
            } catch (wsErr) {
              console.error("Failed to send socket updates on contact submission:", wsErr);
            }
          }
        }
        broadcastAdminList().catch((err) => {
          console.error("Failed to broadcast chat list on contact submission:", err);
        });
      }
      res.status(201).json({
        success: true,
        message: "Message received successfully!",
        accountCreated,
        accountCredentials
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "Failed to process message" });
    }
  });
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const users = await getAllUsers();
      res.json(users);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const { id, name, email, password, role, enrolledClass } = req.body;
      if (id) {
        const updates = { name, email, role, enrolledClass };
        if (password && password.trim() !== "") {
          updates.password = await bcrypt2.hash(password, 10);
        }
        const updated = await updateUser(id, updates);
        return res.json(updated);
      } else {
        if (!name || !email || !password) {
          return res.status(400).json({ error: "Name, email and password are required for creation" });
        }
        const existing = await getUserByEmail(email);
        if (existing) {
          return res.status(400).json({ error: "Email already registered" });
        }
        const hashedPassword = await bcrypt2.hash(password, 10);
        const user = await createUser({
          name,
          email,
          password: hashedPassword,
          role: role || "user",
          enrolledClass: enrolledClass || "Basic Fitness"
        });
        return res.status(201).json(user);
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const deleted = await deleteUser(req.params.id);
      if (!deleted) return res.status(404).json({ error: "User not found" });
      res.json({ success: true, message: "User deleted successfully" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/admin/conversations", requireAdmin, async (req, res) => {
    try {
      const convos = await getAllConversations();
      res.json(convos);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/admin/conversations/:userId", requireAdmin, async (req, res) => {
    try {
      const deleted = await deleteChatThread(req.params.userId);
      await broadcastAdminList();
      res.json({ success: true, message: "Chat thread deleted successfully" });
    } catch (err) {
      res.status(500).json({ error: err.message || "Failed to delete chat thread" });
    }
  });
  app.get("/api/admin/contacts", requireAdmin, async (req, res) => {
    try {
      const contacts = await getAllContactMessages();
      res.json(contacts);
    } catch (err) {
      res.status(500).json({ error: err.message || "Failed to fetch contact inquiries" });
    }
  });
  app.delete("/api/admin/contacts/:id", requireAdmin, async (req, res) => {
    try {
      const deleted = await deleteContactMessage(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Contact inquiry not found" });
      res.json({ success: true, message: "Contact inquiry deleted successfully" });
    } catch (err) {
      res.status(500).json({ error: err.message || "Failed to delete contact inquiry" });
    }
  });
  app.get("/api/chats/history", authenticateToken, async (req, res) => {
    try {
      const { userId } = req.query;
      let targetId = req.user.userId;
      if (req.user.role === "admin" && userId) {
        targetId = userId;
      }
      const history = await getChatHistory(targetId);
      res.json(history);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite Middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode...");
    const distPath = path2.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path2.join(distPath, "index.html"));
    });
  }
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`===============================================`);
    console.log(`Server successfully started and listening on:`);
    console.log(`http://localhost:${PORT}`);
    console.log(`===============================================`);
  });
}
startServer().catch((err) => {
  console.error("FATAL: Failed to start training studio server:", err);
});
//# sourceMappingURL=server.js.map
