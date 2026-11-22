export class BlocklistManager {
  private blockedCompanies = new Set<string>();
  private blockedDomains = new Set<string>();

  constructor() {
    // Configurações iniciais de bloqueio padrão para proteção da comunidade
    this.addBlockedCompany("example-scam-company");
    this.addBlockedDomain("malicious-jobs.com");
    this.addBlockedDomain("scam-board.org");
  }

  addBlockedCompany(company: string): void {
    this.blockedCompanies.add(company.toLowerCase().trim());
  }

  addBlockedDomain(domain: string): void {
    this.blockedDomains.add(domain.toLowerCase().trim());
  }

  isCompanyBlocked(company: string): boolean {
    return this.blockedCompanies.has(company.toLowerCase().trim());
  }

  isUrlBlocked(url: string): boolean {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      for (const blocked of this.blockedDomains) {
        if (host === blocked || host.endsWith(`.${blocked}`)) {
          return true;
        }
      }
      return false;
    } catch {
      return true; // URLs malformadas são consideradas bloqueadas por segurança
    }
  }

  getAllBlockedCompanies(): string[] {
    return Array.from(this.blockedCompanies);
  }

  getAllBlockedDomains(): string[] {
    return Array.from(this.blockedDomains);
  }
}

export const blocklistManager = new BlocklistManager();
