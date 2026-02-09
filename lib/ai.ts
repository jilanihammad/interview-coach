import {
  ICP,
  ICPSegment,
  Launch,
  Outreach,
  Pitch,
  Pricing,
  PricingTier,
  ProductHuntKit,
} from "./types";

type PitchInput = {
  name: string;
  description: string;
  feedback?: string;
};

type PricingInput = {
  name: string;
  description: string;
};

type ICPInput = {
  name: string;
  description: string;
};

type OutreachInput = {
  name: string;
  description: string;
  icp?: ICP;
};

type LaunchInput = {
  name: string;
  description: string;
  platform: "producthunt" | "twitter" | "linkedin" | "hackernews";
};

const short = (text: string, max = 90) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

const sentenceCase = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

const clampWords = (text: string, maxWords: number) => {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;
  return `${words.slice(0, maxWords).join(" ")}…`;
};

const clean = (value?: string) => value?.trim() ?? "";

export function generatePitch(input: PitchInput): Pitch {
  const description =
    clean(input.description) || "Launch toolkit that removes the last 10% friction";
  const feedback = clean(input.feedback);
  const oneLiner = clampWords(
    `${input.name} — ${description.replace(/\.$/, "")}`,
    10
  );

  const elevatorSentences = [
    `${sentenceCase(short(description, 140))}.`,
    "Combines pitch, pricing, ICP, outreach, and launch prep in one focused workspace.",
    feedback ? `${sentenceCase(feedback)}.` : "",
  ].filter(Boolean);

  const detailedSentences = [
    `${sentenceCase(short(description, 200))}.`,
    "Clarifies the promise, suggests pricing, and maps ICP + outreach so you can share confidently.",
    "Keeps everything local with lightweight AI drafts you can tweak fast.",
    feedback ? `Emphasis: ${sentenceCase(feedback)}.` : "",
  ].filter(Boolean);

  return {
    oneLiner,
    elevator: elevatorSentences.join(" "),
    detailed: detailedSentences.join(" "),
  };
}

const buildTiers = (name: string): PricingTier[] => [
  {
    name: "Free",
    price: "$0",
    features: [
      "Core features",
      "Limited usage",
      `Great for testing ${name}`,
    ],
  },
  {
    name: "Pro",
    price: "$29/mo",
    features: ["Full feature set", "Priority support", "Higher limits"],
  },
  {
    name: "Team",
    price: "$79/mo",
    features: ["Collaboration", "Advanced reporting", "Success check-ins"],
  },
];

export function generatePricing(input: PricingInput): Pricing {
  const descriptor =
    short(
      clean(input.description) ||
        "tooling that keeps launches organized and ready to share",
      180
    ) || "Launch toolkit for indie founders";

  return {
    model: "Freemium → Pro subscription",
    tiers: buildTiers(input.name),
    notes: `Lead with a generous free tier to seed usage, then nudge active accounts to Pro with usage-based prompts. ${input.name} should anchor on time saved: "${descriptor}". Start at $29/mo for Pro and $79/mo for Team; adjust after the first 20 paid accounts.`,
  };
}

const segmentFromDescription = (
  name: string,
  description: string
): ICPSegment => {
  const trimmed = short(description || "Your audience", 160);
  return {
    name,
    description: `${name} who resonate with: ${trimmed}`,
    painPoints: [
      "Lack of time to launch properly",
      "Unclear messaging or positioning",
      "Hard to choose pricing with confidence",
    ],
    channels: [
      "Indie Hackers",
      "Twitter/X",
      "Founder Slack communities",
      "Product Hunt",
    ],
  };
};

export function generateICP(input: ICPInput): ICP {
  const descriptor =
    clean(input.description) || "launch toolkit for indie builders";

  return {
    segments: [
      segmentFromDescription("Indie founders", descriptor),
      segmentFromDescription("Side-project teams (2-5 people)", descriptor),
    ],
    targets: [
      {
        name: "Indie Worldwide members",
        type: "company",
        url: "https://indieworldwide.co",
        notes: "Active launchers looking for positioning help",
        contacted: false,
        response: "none",
      },
      {
        name: "Product Hunt hunters",
        type: "person",
        notes: "Great to pre-brief for launch day",
        contacted: false,
        response: "none",
      },
    ],
  };
}

export function generateOutreach(input: OutreachInput): Outreach {
  const hook = short(input.description || "your product", 120);
  const segment =
    input.icp?.segments?.[0]?.name ??
    "founders who are close to shipping but stuck on positioning";

  return {
    emailTemplates: [
      `Subject: Quick way to launch ${input.name} faster\n\nHey there — I built ${input.name} to help ${segment}. It does: ${hook}. Want a 5-minute walkthrough this week?`,
      `Subject: ${input.name} can help you ship this week\n\nI noticed you’re working on something cool. ${input.name} keeps launch tasks, pricing, and pitch in one place so you can post confidently. Happy to send a tailored outline.`,
      `Subject: Finish line help for ${input.name}\n\n${segment} keep telling me they're 90% done. ${input.name} gives them a clear pitch, pricing, ICP, and launch kit in one workspace. If that’s useful, I can personalize a checklist for you.`,
    ],
    linkedinTemplates: [
      `Hi! I’m building ${input.name} for ${segment}. It keeps pitch, pricing, and launch content organized so shipping is faster. Interested in trying it?`,
      `Love your work on new products. ${input.name} helps founders turn “almost ready” projects into launch-ready kits with clear pitch + pricing. Can I share a short preview?`,
    ],
  };
}

const buildProductHunt = (
  name: string,
  description: string
): ProductHuntKit => ({
  tagline: short(`${name} — launch-ready pitch, pricing, and outreach`, 60),
  description: `${name} is a toolkit that turns your almost-ready product into a launch-ready package with pitch, pricing, ICP, and outreach templates. ${short(description || "Built for indie founders", 120)}`,
  firstComment:
    "Thanks for checking this out! Built for indie founders who want to ship faster. Would love feedback on the pitch + pricing suggestions.",
  makerComment:
    "I built this after struggling to finish launches. It keeps everything in one place and gives AI drafts for pitch, pricing, ICP, outreach, and launch kits.",
});

export function generateLaunch(input: LaunchInput): Launch {
  const { name, description, platform } = input;

  if (platform === "producthunt") {
    return { productHunt: buildProductHunt(name, description) };
  }

  if (platform === "twitter") {
    return {
      twitter: [
        `${name} is live soon 🚀`,
        `Why it matters: ${short(description, 120)}`,
        "What you get: pitch generator, pricing advisor, ICP + outreach templates, launch kit",
        "DM for early access; building in public and would love feedback.",
      ].join("\n\n"),
    };
  }

  if (platform === "linkedin") {
    return {
      linkedin: `Launching ${name} to help founders go from 90% done to launched. It combines pitch, pricing, ICP, outreach, and a Product Hunt kit in one workspace. Looking for 5 testers this week — happy to set you up.`,
    };
  }

  return {
    hackerNews: `Show HN: ${name} — a personal launch toolkit for indie founders. It keeps pitch, pricing, ICP, outreach, and launch tasks together. Looking for feedback from anyone shipping side projects.`,
  };
}
