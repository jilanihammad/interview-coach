# Launcher - Product Requirements Document

## Product Overview

**Launcher** is a personal launch toolkit for indie founders with multiple products. It helps you go from "90% done" to "launched and in front of customers" by providing AI-powered assistance for pitching, pricing, finding customers, and executing launches.

This is a personal productivity tool, not a SaaS to monetize.

### Problem Statement

Founders often build great products but struggle with the last 10%:
- Articulating a clear, compelling pitch
- Deciding on the right pricing model
- Identifying and reaching ideal customers
- Actually executing a launch (Product Hunt, Twitter, cold outreach)

### Solution

A web app that:
1. Stores your products and their context
2. Uses AI to generate/refine pitches, suggest pricing, identify ICPs
3. Generates launch content for multiple platforms
4. Tracks your progress across all products

---

## Target Users

**Primary User**: Indie founders / solopreneurs with multiple product ideas

**Characteristics**:
- Technical enough to build products but struggles with marketing/launch
- Has 1-5 products in various stages of completion
- Time-constrained, needs efficiency
- Comfortable with AI tools
- Values speed over perfection

**Use Cases**:
- Founder with a SaaS app ready to launch, needs help with positioning and outreach
- Indie hacker with multiple side projects, wants to finally ship one properly
- Solo developer who built something cool but doesn't know how to find customers

**Not For**:
- Large teams with dedicated marketing
- Products requiring enterprise sales cycles
- Non-technical users who need hand-holding

---

## User Stories

### Product Management
- As a founder, I can add a new product with its name and description
- As a founder, I can edit product details at any time
- As a founder, I can delete a product I'm no longer pursuing
- As a founder, I can see all my products in a sidebar

### Pitch
- As a founder, I can generate a pitch for my product using AI
- As a founder, I can iterate on the pitch with feedback
- As a founder, I can save the finalized pitch
- As a founder, I can see different pitch versions (one-liner, elevator, detailed)

### Pricing
- As a founder, I can get pricing model suggestions based on my product type
- As a founder, I can see competitor pricing for reference
- As a founder, I can save my chosen pricing model
- As a founder, I can get AI feedback on my pricing

### ICP (Ideal Customer Profile)
- As a founder, I can generate ICP suggestions for my product
- As a founder, I can define multiple customer segments
- As a founder, I can save specific companies/people as targets

### Outreach
- As a founder, I can generate cold email templates for my ICP
- As a founder, I can generate LinkedIn messages
- As a founder, I can personalize outreach for specific targets
- As a founder, I can track which outreach I've sent

### Launch
- As a founder, I can generate a Product Hunt launch kit (tagline, description, first comment, maker comment)
- As a founder, I can generate a Twitter/X launch thread
- As a founder, I can generate a LinkedIn announcement
- As a founder, I can generate a Hacker News Show HN post
- As a founder, I can see a launch checklist and track completion

### Progress Tracking
- As a founder, I can see the launch status of each product at a glance
- As a founder, I can mark tasks as complete
- As a founder, I can see what's left to do before launch

---

## Core Features

### 1. Product Registry
- Add/edit/delete products
- Each product stores: name, description, pitch, pricing, ICP, launch status
- Products persist in local SQLite database

### 2. AI Pitch Generator
- Takes product description as input
- Generates three versions:
  - **One-liner**: 10 words or less
  - **Elevator pitch**: 2-3 sentences
  - **Detailed pitch**: Full paragraph with problem/solution/benefit
- Iterate with "make it punchier", "focus on X benefit", etc.

### 3. Pricing Advisor
- Analyzes product type (B2B SaaS, consumer app, marketplace, etc.)
- Suggests pricing models:
  - Freemium + paid tiers
  - One-time purchase
  - Usage-based
  - Free + premium support
- Provides reasoning for each suggestion
- Optional: Research competitor pricing (if URLs provided)

### 4. ICP Generator
- Generates ideal customer profiles based on product
- Includes:
  - Demographics/firmographics
  - Pain points
  - Where they hang out online
  - How to reach them
- Can add specific target companies/people

### 5. Outreach Generator
- Cold email templates (3 variations)
- LinkedIn connection request + follow-up message
- Personalization placeholders
- Follow-up sequence (Day 1, Day 3, Day 7)

### 6. Launch Kit Generator
- **Product Hunt**: Tagline, description, first comment, images checklist
- **Twitter/X**: Launch thread (5-7 tweets)
- **LinkedIn**: Professional announcement post
- **Hacker News**: Show HN post
- Each with copy button for easy use

### 7. Progress Tracker
- Checklist per product:
  - [ ] Pitch finalized
  - [ ] Pricing decided
  - [ ] ICP defined
  - [ ] Landing page live
  - [ ] 10 outreach messages sent
  - [ ] Product Hunt scheduled
  - [ ] Launch executed
- Visual progress bar
- Dashboard showing all products' status

---

## Tech Stack

- **Frontend**: Next.js 14+ (App Router), React, TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **Database**: SQLite (via better-sqlite3) for local persistence
- **AI**: OpenAI API (GPT-4) or Anthropic API (Claude)
- **State**: React Context or Zustand for client state

---

## Data Model

### Product
```typescript
interface Product {
  id: string;                  // UUID
  name: string;                // "GreenLens"
  description: string;         // "AI lawn care quoting app..."
  createdAt: Date;
  updatedAt: Date;
  
  // Generated/saved content
  pitch?: {
    oneLiner?: string;
    elevator?: string;
    detailed?: string;
  };
  
  pricing?: {
    model: string;             // "freemium", "subscription", etc.
    tiers?: PricingTier[];
    notes?: string;
  };
  
  icp?: {
    segments: ICPSegment[];
    targets: Target[];         // Specific companies/people
  };
  
  outreach?: {
    emailTemplates: string[];
    linkedinTemplates: string[];
  };
  
  launch?: {
    productHunt?: ProductHuntKit;
    twitter?: string;          // Thread as single string with separators
    linkedin?: string;
    hackerNews?: string;
  };
  
  progress: {
    pitchDone: boolean;
    pricingDone: boolean;
    icpDone: boolean;
    landingPageDone: boolean;
    outreachStarted: boolean;
    launchScheduled: boolean;
    launched: boolean;
  };
}

interface PricingTier {
  name: string;                // "Free", "Pro", "Enterprise"
  price: string;               // "$0", "$29/mo", "Custom"
  features: string[];
}

interface ICPSegment {
  name: string;                // "Small landscaping companies"
  description: string;
  painPoints: string[];
  channels: string[];          // Where to reach them
}

interface Target {
  name: string;                // Company or person name
  type: "company" | "person";
  url?: string;                // LinkedIn, website
  notes?: string;
  contacted: boolean;
  response?: "none" | "positive" | "negative";
}

interface ProductHuntKit {
  tagline: string;             // 60 chars max
  description: string;
  firstComment: string;
  makerComment: string;
}
```

---

## API / Interface Design

### API Routes (Next.js API routes)

```
POST   /api/products              - Create product
GET    /api/products              - List all products
GET    /api/products/:id          - Get single product
PUT    /api/products/:id          - Update product
DELETE /api/products/:id          - Delete product

POST   /api/generate/pitch        - Generate pitch variations
POST   /api/generate/pricing      - Generate pricing suggestions
POST   /api/generate/icp          - Generate ICP
POST   /api/generate/outreach     - Generate outreach templates
POST   /api/generate/launch/:platform  - Generate launch content
```

### Generate Request/Response

```typescript
// Request
POST /api/generate/pitch
{
  productId: string;
  description: string;
  feedback?: string;           // "make it punchier"
}

// Response
{
  oneLiner: string;
  elevator: string;
  detailed: string;
}
```

---

## UI/UX Design

### Layout
- **Left sidebar** (240px): Product list + Add Product button
- **Main area**: Tabbed interface for current product
- **Tabs**: Pitch | Pricing | ICP | Outreach | Launch | Progress

### Pages/Views

1. **Empty state**: No products yet, prompt to add first product
2. **Product view**: Tabs for each feature area
3. **Add/Edit product modal**: Name + description form

### Key Interactions
- Click product in sidebar → loads that product
- Click tab → shows that feature area
- Generate button → shows loading, then AI response
- Save button → persists to database
- Copy button → copies text to clipboard with toast confirmation
- Checkbox → marks progress item complete

### Visual Design
- Dark theme (consistent with Leadership Autopilot)
- Colors: Slate background, blue accents, green for success
- Clean typography, good spacing
- Loading states with spinners
- Toast notifications for actions

---

## Non-Functional Requirements

### Performance
- Page load: < 2 seconds
- AI generation: < 10 seconds (show loading state)
- Database queries: < 100ms

### Reliability
- Data persists in local SQLite — no data loss on browser refresh
- Graceful handling of AI API failures (show error, allow retry)
- Works offline for viewing saved content (generation requires internet)

### Security
- API keys stored in environment variables, never exposed to client
- No authentication required (single-user local app)
- No sensitive data sent to external services except AI prompts

### Usability
- Responsive design (works on laptop screens, not optimized for mobile)
- Keyboard shortcuts for common actions (Cmd+S to save, Cmd+C to copy)
- Clear loading and error states
- Toast notifications for actions

### Maintainability
- TypeScript for type safety
- Consistent code style (ESLint + Prettier)
- Component-based architecture
- Separated concerns (UI, API, database, AI)

---

## Out of Scope

The following are explicitly **NOT** part of the MVP:

1. **Multi-user / Authentication** — This is a personal tool, no login needed
2. **Cloud sync** — Data stays local in SQLite
3. **Team collaboration** — Single user only
4. **Mobile app** — Web only, desktop-optimized
5. **Email sending** — Generate templates, but user sends manually
6. **CRM integration** — No Hubspot/Salesforce/etc integration
7. **Analytics / tracking** — No usage analytics
8. **Competitor scraping** — User provides competitor info manually
9. **Image generation** — For PH screenshots, user creates manually
10. **Social media posting** — Generate content, user posts manually
11. **Payment processing** — No billing, this is a free personal tool
12. **Version history** — Only latest version of each content piece saved
13. **Export functionality** — Copy/paste only, no markdown/PDF export
14. **AI model selection** — Hardcoded to one provider (OpenAI or Anthropic)

---

## Acceptance Criteria

### MVP Must-Haves
1. ✅ Can add/edit/delete products
2. ✅ Can generate and save pitch for a product
3. ✅ Can generate pricing suggestions
4. ✅ Can generate ICP
5. ✅ Can generate outreach templates
6. ✅ Can generate Product Hunt launch kit
7. ✅ Can track progress with checkboxes
8. ✅ Data persists across browser sessions
9. ✅ Copy button works for all generated content

### Nice-to-Haves (v2)
- Twitter thread generator
- LinkedIn post generator
- Competitor research (given URLs)
- Export all content as Markdown
- Multiple pitch versions history
- Outreach tracking (sent/responded)

---

## File Structure

```
launcher/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                 # Main dashboard
│   ├── api/
│   │   ├── products/
│   │   │   ├── route.ts         # GET, POST
│   │   │   └── [id]/
│   │   │       └── route.ts     # GET, PUT, DELETE
│   │   └── generate/
│   │       ├── pitch/route.ts
│   │       ├── pricing/route.ts
│   │       ├── icp/route.ts
│   │       ├── outreach/route.ts
│   │       └── launch/[platform]/route.ts
├── components/
│   ├── sidebar.tsx
│   ├── product-tabs.tsx
│   ├── pitch-tab.tsx
│   ├── pricing-tab.tsx
│   ├── icp-tab.tsx
│   ├── outreach-tab.tsx
│   ├── launch-tab.tsx
│   ├── progress-tab.tsx
│   ├── add-product-modal.tsx
│   └── ui/                      # shadcn components
├── lib/
│   ├── db.ts                    # SQLite setup
│   ├── ai.ts                    # LLM client
│   ├── types.ts                 # TypeScript types
│   └── prompts.ts               # AI prompt templates
├── .env.local                   # API keys
├── package.json
└── README.md
```

---

## Success Metrics

This is a personal tool, but success looks like:
1. All three products (GreenLens, MindfulAI, Boost) have complete launch kits
2. At least one product launched on Product Hunt using Launcher-generated content
3. Time from "I should launch this" to "launched" reduced from weeks to days

---

## Open Questions

1. Should we support multiple users or keep it single-user?
   → **Decision**: Single-user for MVP. No auth needed.

2. Should generated content be versioned/historied?
   → **Decision**: Just keep latest for MVP. Add history in v2.

3. Cloud sync or local only?
   → **Decision**: Local SQLite for MVP. Simple and private.
