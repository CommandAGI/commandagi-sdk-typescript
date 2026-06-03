# CommandAGI Node/TypeScript SDK

Launch real cloud **computers** and **3D robot simulations** and control them from Node — stream the
robot's camera, send actions, run episodes — or bring **your own robot** online. No agent: you drive.

```bash
npm install commandagi
```

## Drive a 3D robot world

```ts
import { CommandAGI } from "commandagi";

const cagi = new CommandAGI({ apiKey: "cagi_…" }); // or COMMANDAGI_API_KEY

const world = await cagi.launch("simulation/warehouse");
let obs = await world.observe();          // JPEG bytes from the robot's head camera
for (let i = 0; i < 20; i++) obs = await world.step("turn", { dir: "left" });
await world.reset();                      // robot back to the episode start
await world.close();                      // stop + release the cloud VM
```

Scenes: `simulation/warehouse`, `simulation/house-on-fire`, `simulation/school`. Computers work the
same way (`cagi.launch("computer/software-engineer")` → `observe()` returns the screen; actions are
`click`/`type`/`key`). Robot/sim actions: `move`, `back`, `turn`, `stop`, `reset`.

## Bring your own robot

Stream your robot's camera into a session and apply the actions it receives — anyone (a person, an
agent, another developer) can then watch and drive it, like a hosted simulation.

```ts
const bridge = await cagi.registerRobot("my-rover");
console.log("watch + drive at:", bridge.sessionUrl);

bridge.run({
  camera: () => myRobot.jpegFrame(),                 // () => Buffer (JPEG/PNG)
  onAction: (action, payload) => myRobot.do(action, payload),
  fps: 10,
});
```

## Auth

Create an API key with an `operator` scope (dashboard → API keys). Pass `apiKey` or set
`COMMANDAGI_API_KEY`. Target another environment with `COMMANDAGI_BASE_URL`.

Docs: <https://commandagi.com/docs/robots>
