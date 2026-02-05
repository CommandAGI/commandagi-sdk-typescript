# commandAGI Node.js SDK

Official Node.js/TypeScript SDK for [commandAGI](https://commandagi.com) - Command the AGI with taste.

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
  apiKey: process.env.COMMANDAGI_API_KEY,
});

// Create a profile
const profile = await client.profiles.create({
  name: 'my-taste-profile',
});

// Evaluate content against the profile
const result = await client.profiles.eval(profile.id, {
  frameUrl: 'https://example.com/image.jpg',
});

console.log(`Score: ${result.score}, Confidence: ${result.confidence}`);
```

## API Reference

### Profiles

```typescript
// Create a new profile
const profile = await client.profiles.create({
  name: 'profile-name',
  description: 'Optional description',
});

// Get a profile
const profile = await client.profiles.get('profile_id');

// Update a profile
const updated = await client.profiles.update('profile_id', {
  name: 'new-name',
});

// Delete a profile
await client.profiles.delete('profile_id');

// List all profiles
const profiles = await client.profiles.list();

// Evaluate content
const result = await client.profiles.eval('profile_id', {
  frameUrl: 'https://example.com/image.jpg',
  dimensions: ['composition', 'color'], // optional
});

// Export profile data
const data = await client.profiles.export('profile_id', 'full');
```

## Configuration

```typescript
const client = new CommandAGI({
  apiKey: 'cagi_xxx...', // Required
  baseUrl: 'https://api.commandagi.com', // Optional, defaults to production
});
```

## License

MIT
