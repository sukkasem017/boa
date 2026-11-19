# LabQ — ระบบจองคิวห้องปฏิบัติการและยืม-คืนอุปกรณ์

เว็บ static (HTML + CSS + JavaScript ล้วน ไม่ต้อง build) เชื่อมฐานข้อมูล **Supabase** และขึ้นโฮสต์ฟรีบน **GitHub Pages** ได้ทันที

```
labq/
├── index.html            โครงหน้าเว็บ + ไอคอน
├── css/styles.css        สไตล์ทั้งหมด (โทเคนสี/ขนาดตัวอักษรอยู่ต้นไฟล์)
├── js/
│   ├── config.js         ★ ใส่ Supabase URL และ key ที่นี่
│   ├── api.js            ชั้นเชื่อมข้อมูล (Supabase จริง / โหมดสาธิต)
│   ├── demo-data.js      ข้อมูลตัวอย่างของโหมดสาธิต
│   └── app.js            หน้าจอ, เส้นทาง, ฟอร์ม, แอดมิน
├── supabase/
│   ├── schema.sql        ตาราง, ฟังก์ชัน, RLS  (รันก่อน)
│   └── seed.sql          ห้อง/อุปกรณ์ตัวอย่าง  (รันทีหลัง)
├── docs/DESIGN.md        แผนผังเส้นทาง + เหตุผลการออกแบบ
└── .nojekyll
```

## ลองใช้ทันที (โหมดสาธิต)
เปิด `index.html` ด้วย Live Server หรือรัน `python3 -m http.server` ในโฟลเดอร์นี้แล้วเปิด `http://localhost:8000`
ถ้า `config.js` ยังว่าง เว็บจะใช้ข้อมูลตัวอย่างในเบราว์เซอร์ ลอง “บัญชีตัวอย่าง 6612345678” ในหน้าคำขอของฉัน และปุ่ม “ทดลองสัญญาณขาด” ท้ายหน้า

## เชื่อม Supabase (5 ขั้นตอน)
1. สร้างโปรเจกต์ที่ https://supabase.com
2. เมนู **SQL Editor** วางเนื้อหา `supabase/schema.sql` กด Run แล้วทำเช่นเดียวกับ `supabase/seed.sql`
3. เมนู **Project Settings → API** คัดลอก *Project URL* และ *anon / publishable key* ไปใส่ `js/config.js`
4. สร้างผู้ดูแล: **Authentication → Users → Add user** (อีเมล+รหัสผ่าน) จากนั้นรันใน SQL Editor
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'อีเมลผู้ดูแล';
   ```
5. ทดสอบในเครื่อง แล้วเข้าหน้า **ผู้ดูแล** ด้วยอีเมลที่สร้างไว้

> จะเพิ่ม/แก้ห้องและอุปกรณ์ ทำได้ที่ **Table Editor → resources** ของ Supabase

## ขึ้น GitHub Pages
1. สร้าง repo ใหม่ แล้วอัปโหลดทุกไฟล์ (หรือ `git init && git add . && git commit && git push`)
2. **Settings → Pages → Build and deployment → Deploy from a branch → main / (root)**
3. รอ 1–2 นาที เว็บจะอยู่ที่ `https://<ชื่อผู้ใช้>.github.io/<ชื่อ repo>/`
4. (ถ้าใช้ Auth) ใน Supabase **Authentication → URL Configuration** ใส่ลิงก์เว็บข้างบนเป็น Site URL

## เรื่องความปลอดภัย (อ่านก่อนใช้งานจริง)
- anon key เปิดเผยในหน้าเว็บได้ตามออกแบบของ Supabase **ห้ามใส่ `service_role` key** ลงในเว็บเด็ดขาด
- นักศึกษาไม่ได้ล็อกอิน ใช้ “รหัสนักศึกษา” ระบุตัวตน ตารางจริงปิด RLS ไม่ให้อ่านตรง ๆ นักศึกษาเข้าถึงผ่านฟังก์ชัน (`create_request`, `my_requests`, `student_action`) และเห็นตารางเวลาแบบไม่มีชื่อผ่านวิว `public_bookings`
- **ข้อจำกัด:** ใครรู้รหัสนักศึกษาของคนอื่นก็ดูคำขอของคนนั้นได้ เหมาะกับต้นแบบ/ใช้ภายใน หากต้องการความปลอดภัยสูงขึ้นให้เปลี่ยนเป็น Supabase Auth (อีเมลมหาวิทยาลัย/Magic link) แล้วผูก `student_id` กับ `auth.uid()`
- การจองห้องซ้อนเวลาถูกกันที่ระดับฐานข้อมูล (exclusion constraint) แม้มีคนกดพร้อมกัน
- ควรเปิด rate limit / CAPTCHA ของ Supabase หากเปิดให้คนภายนอกใช้

## ปรับแต่งง่าย ๆ
- ชั่วโมงเปิด-ปิดห้อง: `OPEN_HOUR`, `CLOSE_HOUR` ใน `js/config.js`
- สี/ฟอนต์/ขนาดตัวอักษร: ตัวแปร `:root` ต้นไฟล์ `css/styles.css`
- ชื่อระบบ: `index.html` และ `css`/`app.js` (ค้นหา “LabQ”)
