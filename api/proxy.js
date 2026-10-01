// ============================================================
// api/proxy.js — Vercel Serverless Cache Proxy
// ============================================================
// วัตถุประสงค์: ลดโหลดที่ไปโดนโควตา "request พร้อมกัน" ของ
// Google Apps Script (~30 requests พร้อมกัน) ตอนนักเรียนเข้าใช้
// พร้อมกันเยอะๆ (เปิดคาบเรียน, แย่งกันตีบอส)
//
// หลักการ: endpoint แบบ "อ่านข้อมูล" (GET) ที่ไม่ค่อยเปลี่ยนบ่อย
// จะถูก cache ไว้ที่ Vercel Edge Network ผ่าน Cache-Control header
// ถ้ามีคนขอข้อมูลเดิมซ้ำในช่วง cache ยังไม่หมดอายุ Vercel จะตอบ
// จาก Edge เลย ไม่ยิงไป Apps Script ซ้ำ ลดโหลดได้มหาศาลตอนพีค
//
// endpoint แบบ "เขียนข้อมูล" (POST) จะไม่ cache เด็ดขาด ส่งตรง
// ไป Apps Script ทุกครั้งเพื่อความถูกต้องของข้อมูล
//
// ⚠️ ต้องคัดลอกไฟล์นี้ไปวางในโปรเจกต์ Vercel "ทั้งสองอัน"
// (แอปข้อสอบ และแอปร้านค้า) เพราะแต่ละโปรเจกต์มี Edge Network
// ของตัวเอง ไม่ได้ใช้ cache ร่วมกัน
// ============================================================

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzTTMBPvbsZckZgmQz274CBFDD1DYisym4T1Eh_CbvkzV-iDdfvXZzwrT2OSRQo4NPvhw/exec";

// ── TTL (วินาที) ต่อ action ──────────────────────────────────
// sMaxAge = cache อยู่ที่ Vercel Edge นานเท่าไหร่
// swr (stale-while-revalidate) = ถ้า cache หมดอายุ ยังใช้ของเก่า
//   ตอบไปก่อนได้ระหว่างที่ Vercel แอบไปขอของใหม่เบื้องหลัง
//   (ผู้ใช้ไม่ต้องรอ ได้คำตอบเร็วเสมอ)
const CACHE_RULES = {
  // ── ข้อมูลที่แทบไม่เปลี่ยน — cache ได้นาน ──
  getQuestions:        { sMaxAge: 300, swr: 600 },
  getQuizSets:         { sMaxAge: 300, swr: 600 },
  getConfig:           { sMaxAge: 300, swr: 600 },
  getChallengeConfig:  { sMaxAge: 300, swr: 600 },
  getCharacter:        { sMaxAge: 300, swr: 600 },
  getItemLibrary:      { sMaxAge: 180, swr: 300 },

  // ── ข้อมูลที่เปลี่ยนบ่อยปานกลาง — cache สั้น ──
  getStudent:          { sMaxAge: 20, swr: 40 },   // ช่วยตอน login พร้อมกันเยอะ
  getRareProgress:     { sMaxAge: 10, swr: 20 },

  // ── ข้อมูล real-time (HP บอส, Gold, Inventory) — cache สั้นมาก ──
  // แค่พอกันคนกดรัวๆ/รีเฟรชพร้อมกันหลายคนในวินาทีเดียวกัน
  getActiveBoss:       { sMaxAge: 5, swr: 10 },
  getBossLeaderboard:  { sMaxAge: 5, swr: 10 },
  getPlayerStats:      { sMaxAge: 5, swr: 10 },
  getPlayerInventory:  { sMaxAge: 5, swr: 10 },
  getChallengeBundle:  { sMaxAge: 5, swr: 10 },
  getShopBundle:       { sMaxAge: 5, swr: 10 },
  getUnlockConditions: { sMaxAge: 5, swr: 10 },
};

export default async function handler(req, res) {
  const { method } = req;

  // ============================================================
  // POST — เขียนข้อมูล: ส่งตรงเสมอ ไม่ cache เด็ดขาด
  // ============================================================
  if (method === "POST") {
    try {
      // req.body มักมาเป็น string อยู่แล้ว (client ส่งแบบ text/plain
      // เพื่อเลี่ยง CORS preflight) แต่กันเหนียวเผื่อ Vercel parse เป็น object
      const bodyText = typeof req.body === "string" ? req.body : JSON.stringify(req.body);

      const upstream = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: bodyText,
      });
      const text = await upstream.text();

      res.setHeader("Cache-Control", "no-store");
      res.status(upstream.status).send(text);
    } catch (err) {
      res.status(502).json({ error: "เชื่อมต่อ Apps Script ไม่ได้: " + err.message });
    }
    return;
  }

  // ============================================================
  // GET — อ่านข้อมูล: cache ตาม action
  // ============================================================
  try {
    const action = req.query.action || "";
    const rule = CACHE_RULES[action];

    // สร้าง query string ต่อไปหา Apps Script (ตัด key พิเศษของ Vercel ออก)
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) params.set(key, value[0]);
      else params.set(key, value);
    }

    const upstream = await fetch(`${APPS_SCRIPT_URL}?${params.toString()}`);
    const text = await upstream.text();

    if (rule) {
      res.setHeader(
        "Cache-Control",
        `public, s-maxage=${rule.sMaxAge}, stale-while-revalidate=${rule.swr}`
      );
    } else {
      // action ที่ไม่รู้จัก (เช่น ping หรือ action ใหม่ในอนาคต) — ไม่ cache ไว้ก่อนเพื่อความปลอดภัย
      res.setHeader("Cache-Control", "no-store");
    }

    res.status(upstream.status).send(text);
  } catch (err) {
    res.status(502).json({ error: "เชื่อมต่อ Apps Script ไม่ได้: " + err.message });
  }
}
