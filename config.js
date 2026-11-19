/* ============================================================
   LabQ — ไฟล์ตั้งค่า
   1) ไปที่ Supabase Dashboard > Project Settings > API
   2) คัดลอก "Project URL" และ "anon / publishable key" มาใส่ด้านล่าง
   (ค่า 2 อย่างนี้เปิดเผยในเว็บได้ตามปกติ ความปลอดภัยควบคุมด้วย RLS ใน schema.sql)
   ถ้าเว้นว่างไว้ เว็บจะทำงานใน "โหมดสาธิต" เก็บข้อมูลในเบราว์เซอร์ ไม่ต่อฐานข้อมูล
   ============================================================ */
window.LABQ_CONFIG = {
  SUPABASE_URL: "",       // เช่น "https://abcdefghijk.supabase.co"
  SUPABASE_ANON_KEY: "",  // เช่น "eyJhbGciOi..." หรือ "sb_publishable_..."

  OPEN_HOUR: 8,    // ห้องเปิดให้จองตั้งแต่ 08:00
  CLOSE_HOUR: 20   // ปิด 20:00
};
