/* ข้อมูลตัวอย่างสำหรับ "โหมดสาธิต" (ใช้เมื่อยังไม่ได้ตั้งค่า Supabase) */
window.DEMO_RESOURCES = [
  { id:'r1', kind:'room', name:'ห้องอิเล็กทรอนิกส์ E-301', description:'โต๊ะปฏิบัติการพร้อมเครื่องมือวัดและเครื่องจ่ายไฟ เหมาะกับงานวงจรและไมโครคอนโทรลเลอร์', location:'อาคารวิศวกรรม ชั้น 3', capacity:20, stock_total:1, max_hours:3, max_days:0, icon:'⚡', popular:true, active:true,
    rules:['แสดงบัตรนักศึกษากับผู้ดูแลก่อนเข้าใช้','ห้ามนำอาหารและเครื่องดื่มเข้าห้อง','เก็บอุปกรณ์เข้าที่และปิดเครื่องก่อนออกจากห้อง'] },
  { id:'r2', kind:'room', name:'ห้องพิมพ์ 3 มิติ', description:'เครื่องพิมพ์ 3 มิติ 4 เครื่อง และโต๊ะตกแต่งชิ้นงาน', location:'อาคารนวัตกรรม ชั้น 1', capacity:6, stock_total:1, max_hours:4, max_days:0, icon:'🧊', popular:false, active:true,
    rules:['ต้องผ่านการอบรมการใช้เครื่องพิมพ์','ห้ามทิ้งเครื่องขณะกำลังพิมพ์','แจ้งผู้ดูแลหากพบปัญหากับเครื่อง'] },
  { id:'r3', kind:'room', name:'ห้องคอมพิวเตอร์ C-204', description:'คอมพิวเตอร์ 40 เครื่อง ติดตั้งโปรแกรมออกแบบและเขียนโปรแกรม', location:'อาคารเรียนรวม ชั้น 2', capacity:40, stock_total:1, max_hours:3, max_days:0, icon:'💻', popular:false, active:true,
    rules:['ใช้บัญชีมหาวิทยาลัยในการเข้าสู่ระบบ','ห้ามติดตั้งโปรแกรมเพิ่มเอง','บันทึกงานลงที่เก็บข้อมูลของตนเองก่อนออก'] },
  { id:'r4', kind:'room', name:'ห้องกลุ่มย่อย R-105', description:'ห้องประชุมกลุ่ม 8 ที่นั่ง มีจอแสดงผลและไวต์บอร์ด', location:'อาคารวิจัย ชั้น 1', capacity:8, stock_total:1, max_hours:2, max_days:0, icon:'🧪', popular:false, active:true,
    rules:['เหมาะกับการประชุมกลุ่มและติวงานโปรเจกต์','รักษาระดับเสียงไม่ให้รบกวนห้องข้างเคียง'] },
  { id:'r5', kind:'room', name:'สตูดิโอถ่ายภาพ', description:'ฉากถ่ายภาพ ไฟสตูดิโอ และพื้นที่ถ่ายผลิตภัณฑ์', location:'อาคารสื่อสาร ชั้น 2', capacity:10, stock_total:1, max_hours:3, max_days:0, icon:'📸', popular:false, active:true,
    rules:['ห้ามปรับตำแหน่งไฟโดยไม่ได้รับอนุญาต','คืนฉากและอุปกรณ์ให้อยู่ในสภาพเดิม'] },

  { id:'r6', kind:'equipment', name:'ชุด Arduino Uno พร้อมเซนเซอร์', description:'บอร์ด Arduino Uno, สายจัมเปอร์, เบรดบอร์ด และเซนเซอร์พื้นฐาน 10 ชนิด', location:'ห้องเก็บอุปกรณ์ E-110', capacity:null, stock_total:12, max_hours:0, max_days:7, icon:'🤖', popular:true, active:true,
    rules:['ตรวจนับชิ้นส่วนร่วมกับผู้ดูแลก่อนรับและตอนคืน','ห้ามบัดกรีหรือดัดแปลงบอร์ด','หากอุปกรณ์เสียหายต้องแจ้งทันที'] },
  { id:'r7', kind:'equipment', name:'Raspberry Pi 4 (4GB)', description:'บอร์ด Raspberry Pi 4 พร้อมอะแดปเตอร์และการ์ดหน่วยความจำ', location:'ห้องเก็บอุปกรณ์ E-110', capacity:null, stock_total:6, max_hours:0, max_days:7, icon:'🥧', popular:true, active:true,
    rules:['ลบข้อมูลส่วนตัวออกจากการ์ดก่อนคืน','ใช้อะแดปเตอร์ที่แถมไปเท่านั้น'] },
  { id:'r8', kind:'equipment', name:'ออสซิลโลสโคป 2 ช่อง', description:'ออสซิลโลสโคปดิจิทัล 100 MHz พร้อมโพรบ 2 เส้น', location:'ห้องเก็บอุปกรณ์ E-110', capacity:null, stock_total:4, max_hours:0, max_days:2, icon:'📈', popular:false, active:true,
    rules:['ต้องผ่านการอบรมการใช้เครื่องมือวัด','ห้ามนำไปใช้กับแรงดันเกินพิกัดที่ระบุ'] },
  { id:'r9', kind:'equipment', name:'มัลติมิเตอร์ดิจิทัล', description:'มัลติมิเตอร์ดิจิทัลพร้อมสายวัด 1 ชุด', location:'ห้องเก็บอุปกรณ์ E-110', capacity:null, stock_total:15, max_hours:0, max_days:3, icon:'🔧', popular:true, active:true,
    rules:['เปลี่ยนสวิตช์กลับเป็นตำแหน่ง OFF ก่อนคืน'] },
  { id:'r10', kind:'equipment', name:'กล้อง DSLR พร้อมขาตั้ง', description:'กล้อง DSLR เลนส์คิท แบตเตอรี่สำรอง และขาตั้งกล้อง', location:'ห้องสื่อ M-201', capacity:null, stock_total:3, max_hours:0, max_days:3, icon:'📷', popular:true, active:true,
    rules:['ห้ามเปลี่ยนเลนส์ในที่ที่มีฝุ่นหรือความชื้น','ชาร์จแบตเตอรี่เต็มก่อนคืน','ผู้ยืมรับผิดชอบความเสียหายตามระเบียบ'] },
  { id:'r11', kind:'equipment', name:'ชุดเครื่องบัดกรี', description:'หัวแร้งควบคุมอุณหภูมิ ตะกั่วบัดกรี และฟองน้ำทำความสะอาด', location:'ห้องเก็บอุปกรณ์ E-110', capacity:null, stock_total:8, max_hours:0, max_days:3, icon:'🔥', popular:false, active:true,
    rules:['ใช้งานในห้องที่มีการระบายอากาศ','ห้ามวางหัวแร้งร้อนทิ้งไว้โดยไม่มีคนดูแล'] },
  { id:'r12', kind:'equipment', name:'โน้ตบุ๊กสำหรับทำโปรเจกต์', description:'โน้ตบุ๊กสเปกสูง พร้อมกระเป๋าและที่ชาร์จ', location:'ห้องสื่อ M-201', capacity:null, stock_total:5, max_hours:0, max_days:5, icon:'🖥️', popular:false, active:true,
    rules:['ห้ามติดตั้งโปรแกรมเพิ่มโดยไม่ได้รับอนุญาต','ลบไฟล์ส่วนตัวออกก่อนคืน'] }
];
