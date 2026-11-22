import { GreenhouseProvider } from "./greenhouse.js";
import { LeverProvider } from "./lever.js";
import { AshbyProvider } from "./ashby.js";
import type { JobProvider } from "../domain/models.js";

export class ProviderRegistry {
  private providers = new Map<string, JobProvider>();

  constructor() {
    this.register(new GreenhouseProvider());
    this.register(new LeverProvider());
    this.register(new AshbyProvider());
  }

  register(provider: JobProvider): void {
    this.providers.set(provider.name.toLowerCase(), provider);
  }

  get(name: string): JobProvider | undefined {
    return this.providers.get(name.toLowerCase());
  }

  getAll(): JobProvider[] {
    return Array.from(this.providers.values());
  }
}

export const providerRegistry = new ProviderRegistry();
