export type Pitch = {
  oneLiner?: string;
  elevator?: string;
  detailed?: string;
};

export type PricingTier = {
  name: string;
  price: string;
  features: string[];
};

export type Pricing = {
  model?: string;
  tiers?: PricingTier[];
  notes?: string;
};

export type ICPSegment = {
  name: string;
  description: string;
  painPoints: string[];
  channels: string[];
};

export type Target = {
  name: string;
  type: "company" | "person";
  url?: string;
  notes?: string;
  contacted: boolean;
  response?: "none" | "positive" | "negative";
};

export type ICP = {
  segments?: ICPSegment[];
  targets?: Target[];
};

export type Outreach = {
  emailTemplates?: string[];
  linkedinTemplates?: string[];
};

export type ProductHuntKit = {
  tagline?: string;
  description?: string;
  firstComment?: string;
  makerComment?: string;
};

export type Launch = {
  productHunt?: ProductHuntKit;
  twitter?: string;
  linkedin?: string;
  hackerNews?: string;
};

export type Progress = {
  pitchDone: boolean;
  pricingDone: boolean;
  icpDone: boolean;
  landingPageDone: boolean;
  outreachStarted: boolean;
  launchScheduled: boolean;
  launched: boolean;
};

export interface Product {
  id: string;
  name: string;
  description: string;
  status: string;
  pitch?: Pitch;
  pricing?: Pricing;
  icp?: ICP;
  outreach?: Outreach;
  launch?: Launch;
  progress: Progress;
  createdAt: string;
  updatedAt: string;
}

export const defaultProgress: Progress = {
  pitchDone: false,
  pricingDone: false,
  icpDone: false,
  landingPageDone: false,
  outreachStarted: false,
  launchScheduled: false,
  launched: false,
};
