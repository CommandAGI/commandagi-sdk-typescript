# commandAGI Node.js SDK

Official Node.js/TypeScript SDK for [commandAGI](https://commandagi.com) — Command the AGI with taste.

## Installation

```bash
npm install commandagi
# or
pnpm add commandagi
# or
yarn add commandagi
```

## Quick Start

```typescript
import { CommandAGI } from 'commandagi';

const client = new CommandAGI({
  apiKey: process.env.COMMANDAGI_API_KEY!,
});

// Create a profile
const profile = await client.profiles.create({
  projectId: 'your-project-id',
  name: 'my-taste-profile',
  seed: 'minimalist design with warm tones',
});

// Evaluate content against the profile
const result = await client.profiles.eval(profile.id, {
  frameUrl: 'https://example.com/image.jpg',
});

console.log(`Score: ${result.score}, Confidence: ${result.confidence}`);
```

## API Reference

### Client

```typescript
const client = new CommandAGI({
  apiKey: 'cagi_xxx...',               // Required
  baseUrl: 'https://commandagi.com',   // Optional (default)
});
```

### Profiles

```typescript
// Create a profile
const profile = await client.profiles.create({
  projectId: 'project-id',
  name: 'profile-name',
  seed: 'optional initial description',
});

// Get a profile (includes constraints, exemplars, comparisons)
const profile = await client.profiles.get('profile-id');

// Update a profile (partial update)
const updated = await client.profiles.update('profile-id', {
  name: 'new-name',
});

// Delete a profile
await client.profiles.delete('profile-id');

// List all profiles (optionally filter by project)
const allProfiles = await client.profiles.list();
const projectProfiles = await client.profiles.list('project-id');

// Evaluate content
const result = await client.profiles.eval('profile-id', {
  frameUrl: 'https://example.com/image.jpg',
});
// result.score (0-1), result.confidence (0-1), result.details

// Export profile (full)
const fullExport = await client.profiles.export('profile-id');

// Export profile (minimal - for inference)
const minimalExport = await client.profiles.export('profile-id', 'minimal');
```

## License

MIT
