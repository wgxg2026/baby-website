import { AppData } from "../types";

export const today = new Date().toISOString().slice(0, 10);

export const seedData: AppData = {
  startDate: "2024-08-18",
  bucketItems: [
    { id: "b1", title: "一起看一次海边日出", note: "带热奶茶和小毯子", completed: false },
    { id: "b2", title: "去东莞吃一顿好吃的", note: "已经一起去过啦", completed: true, completedAt: "2026-08-12" },
    { id: "b3", title: "拍一组只属于我们的照片", note: "不用很正式，开心就好", completed: false }
  ],
  periodRecords: [
    { id: "p1", startDate: "2026-08-02", endDate: "2026-08-07", mood: "需要抱抱", symptoms: "肚子痛、困", note: "多喝热水不如直接陪着。" }
  ],
  messages: [
    { id: "m1", from: "me", title: "今天有点想你", content: "有些话当面说会害羞，所以先放在这里。", mood: "想念", status: "unread", createdAt: today, replies: [] }
  ],
  locations: [
    { id: "l1", person: "me", city: "广州", note: "刚忙完，准备回家。", updatedAt: today },
    { id: "l2", person: "baby", city: "东莞", note: "今天也要开心。", updatedAt: today }
  ],
  travelCheckins: [
    { id: "t1", city: "东莞", province: "广东", date: "2026-08-12", note: "一起去过，所以这里亮起来。" }
  ],
  musicItems: [
    { id: "s1", title: "小幸运", artist: "田馥甄", link: "", reason: "很适合慢慢走路的时候听。", sharedBy: "baby" }
  ],
  mediaItems: [
    { id: "w1", title: "爱在黎明破晓前", kind: "电影", status: "想看", rating: 0, note: "找一个晚上一起看。" }
  ],
  foodPlaces: [
    { id: "f1", name: "东莞那家很好吃的小店", city: "东莞", address: "", dishes: "下次补上招牌菜", rating: 5, revisit: true, note: "因为是一起去，所以更好吃。" }
  ],
  savingGoals: [],
  achievements: [
    { id: "ach1", title: "会认真把情绪说出来了", note: "不是憋着，而是慢慢讲给彼此听。", date: "2026-08-18" },
    { id: "ach2", title: "东莞被点亮了", note: "一起去过的地方，都会留在地图上。", date: "2026-08-12" },
    { id: "ach3", title: "开始用自己的小站记录生活", note: "把日子过成能回头看的样子。", date: "2026-08-18" }
  ],
  moments: [
    { id: "mo1", text: "第一条朋友圈式记录，给我们的小网站开灯。", place: "东莞", imageUrl: "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=1200&q=80", images: ["https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=1200&q=80"], createdAt: today, author: "me" }
  ],
  comments: [],
  anniversaries: [
    { id: "ann1", title: "恋爱纪念日", date: "2024-08-18", note: "每一年都要认真记得。" },
    { id: "ann2", title: "第一次东莞打卡", date: "2026-08-12", note: "旅行地图的第一盏灯。" }
  ]
};
