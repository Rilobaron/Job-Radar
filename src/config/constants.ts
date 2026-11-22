export const TECHNOLOGIES: Array<{
  name: string;
  category: "language" | "framework" | "database" | "cloud" | "tool";
  patterns: RegExp[];
}> = [
  // Linguagens
  {
    name: "JavaScript",
    category: "language",
    patterns: [/\bjavascript\b/i, /\bjs\b(?!\s*framework|\s*library)/i],
  },
  {
    name: "TypeScript",
    category: "language",
    patterns: [/\btypescript\b/i, /\bts\b(?!\s*&)/i],
  },
  {
    name: "Python",
    category: "language",
    patterns: [/\bpython\b/i, /\bpython3\b/i],
  },
  {
    name: "Java",
    category: "language",
    patterns: [/\bjava\b(?!\s*script)/i],
  },
  {
    name: "C#",
    category: "language",
    patterns: [/\bc#\b/i, /\bc-sharp\b/i, /\bcsharp\b/i],
  },
  {
    name: ".NET",
    category: "framework",
    patterns: [/\b\.net\b/i, /\bdotnet\b/i, /\basp\.net\b/i],
  },
  {
    name: "Go",
    category: "language",
    patterns: [
      /\bgolang\b/i,
      /\bgo\s+language\b/i,
      /\b(?:in|using|with|of|em|com)\s+go\b/i,
      /\bgo\s*(?:,|and|or|\/)/i,
      /\bgo\s+(?:developer|engineer|backend|dev)\b/i,
      /\b(?:backend|dev|developer|engineer)\s+go\b/i,
    ],
  },
  {
    name: "Rust",
    category: "language",
    patterns: [/\brust\b(?!\s*iron)/i, /\brustlang\b/i],
  },
  {
    name: "PHP",
    category: "language",
    patterns: [/\bphp\b/i],
  },
  {
    name: "Ruby",
    category: "language",
    patterns: [/\bruby\b(?!\s*gemstone)/i],
  },
  {
    name: "Dart",
    category: "language",
    patterns: [/\bdart\b/i],
  },

  // Frameworks & Libs
  {
    name: "Node.js",
    category: "framework",
    patterns: [/\bnode\.?js\b/i, /\bnode\s+runtime\b/i, /\bbackend\s+node\b/i],
  },
  {
    name: "React",
    category: "framework",
    patterns: [/\breact\.?js\b/i, /\breact\b(?!\s*native)/i],
  },
  {
    name: "React Native",
    category: "framework",
    patterns: [/\breact\s+native\b/i],
  },
  {
    name: "Next.js",
    category: "framework",
    patterns: [/\bnext\.?js\b/i, /\bnextjs\b/i],
  },
  {
    name: "Vue",
    category: "framework",
    patterns: [
      /\bvue\.?js\b/i,
      /\bvuejs\b/i,
      /\bvue\s+3\b/i,
      /\bvue\b(?!\s*point)/i,
    ],
  },
  {
    name: "Angular",
    category: "framework",
    patterns: [/\bangular\b(?!\s*momentum|\s*velocity)/i, /\bangularjs\b/i],
  },
  {
    name: "Laravel",
    category: "framework",
    patterns: [/\blaravel\b/i],
  },
  {
    name: "Rails",
    category: "framework",
    patterns: [/\bruby\s+on\s+rails\b/i, /\brails\b/i],
  },
  {
    name: "Flutter",
    category: "framework",
    patterns: [/\bflutter\b/i],
  },

  // Databases
  {
    name: "PostgreSQL",
    category: "database",
    patterns: [/\bpostgres(?:ql)?\b/i],
  },
  {
    name: "MySQL",
    category: "database",
    patterns: [/\bmysql\b/i],
  },
  {
    name: "MongoDB",
    category: "database",
    patterns: [/\bmongodb\b/i, /\bmongo\b/i],
  },
  {
    name: "Redis",
    category: "database",
    patterns: [/\bredis\b/i],
  },
  {
    name: "Supabase",
    category: "database",
    patterns: [/\bsupabase\b/i],
  },

  // Cloud & DevOps
  {
    name: "AWS",
    category: "cloud",
    patterns: [/\baws\b/i, /\bamazon\s+web\s+services\b/i],
  },
  {
    name: "Azure",
    category: "cloud",
    patterns: [/\bazure\b/i, /\bmicrosoft\s+azure\b/i],
  },
  {
    name: "GCP",
    category: "cloud",
    patterns: [/\bgcp\b/i, /\bgoogle\s+cloud\b/i],
  },
  {
    name: "Docker",
    category: "tool",
    patterns: [/\bdocker\b/i],
  },
  {
    name: "Kubernetes",
    category: "tool",
    patterns: [/\bkubernetes\b/i, /\bk8s\b/i],
  },
  {
    name: "Terraform",
    category: "tool",
    patterns: [/\bterraform\b/i],
  },
];

export const DISCORD_LIMITS = {
  TITLE_MAX_LENGTH: 256,
  DESCRIPTION_MAX_LENGTH: 4096,
  FIELD_NAME_MAX_LENGTH: 256,
  FIELD_VALUE_MAX_LENGTH: 1024,
  FIELDS_MAX_COUNT: 25,
  FOOTER_TEXT_MAX_LENGTH: 2048,
  AUTHOR_NAME_MAX_LENGTH: 256,
  TOTAL_EMBED_MAX_CHARACTERS: 6000,
};
