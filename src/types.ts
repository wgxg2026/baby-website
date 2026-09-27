export type ID = string;

export type Person = "me" | "baby";

export type CommentTarget = "message" | "moment" | "goal";

export type Comment = {
  id: ID;
  targetType: CommentTarget;
  targetId: ID;
  author: Person;
  content: string;
  createdAt: string;
};

export type MessageReply = {
  id: ID;
  author: Person;
  content: string;
  createdAt: string;
};

export type BucketItem = {
  id: ID;
  title: string;
  note: string;
  completed: boolean;
  completedAt?: string;
};

export type PeriodRecord = {
  id: ID;
  startDate: string;
  endDate: string;
  mood: string;
  symptoms: string;
  note: string;
};

export type Message = {
  id: ID;
  from: Person;
  title: string;
  content: string;
  mood: string;
  status: "unread" | "read" | "replied";
  createdAt: string;
  replies?: MessageReply[];
};

export type LocationShare = {
  id: ID;
  person: Person;
  city: string;
  note: string;
  updatedAt: string;
};

export type TravelCheckin = {
  id: ID;
  city: string;
  province: string;
  date: string;
  note: string;
};

export type MusicItem = {
  id: ID;
  title: string;
  artist: string;
  link: string;
  reason: string;
  sharedBy: Person;
};

export type MediaItem = {
  id: ID;
  title: string;
  kind: "电影" | "剧集" | "综艺" | "歌曲";
  status: "想看" | "在看" | "已看";
  rating: number;
  note: string;
};

export type FoodPlace = {
  id: ID;
  name: string;
  city: string;
  address: string;
  dishes: string;
  rating: number;
  revisit: boolean;
  note: string;
};

export type SavingGoal = {
  id: ID;
  title: string;
  horizon: "short" | "long";
  note: string;
  dueDate: string;
  completed: boolean;
};

export type Achievement = {
  id: ID;
  title: string;
  note: string;
  date: string;
};

export type Moment = {
  id: ID;
  text: string;
  place: string;
  imageUrl: string;
  images?: string[];
  createdAt: string;
  author: Person;
};

export type Anniversary = {
  id: ID;
  title: string;
  date: string;
  note: string;
};

export type AppData = {
  startDate: string;
  bucketItems: BucketItem[];
  periodRecords: PeriodRecord[];
  messages: Message[];
  locations: LocationShare[];
  travelCheckins: TravelCheckin[];
  musicItems: MusicItem[];
  mediaItems: MediaItem[];
  foodPlaces: FoodPlace[];
  savingGoals: SavingGoal[];
  achievements: Achievement[];
  moments: Moment[];
  comments: Comment[];
  anniversaries: Anniversary[];
};
