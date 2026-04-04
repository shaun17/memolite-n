export type EpisodicMemoryConfig = {
  top_k: number;
  min_score: number;
  context_window: number;
  rerank_enabled: boolean;
};

export type LongTermMemoryConfig = {
  semantic_enabled: boolean;
  episodic_enabled: boolean;
};

export type ShortTermMemoryConfig = {
  message_capacity: number;
  summary_enabled: boolean;
};

export class MemoryConfigService {
  private episodic: EpisodicMemoryConfig = {
    top_k: 5,
    min_score: 0.0001,
    context_window: 1,
    rerank_enabled: true
  };

  private shortTerm: ShortTermMemoryConfig = {
    message_capacity: 4096,
    summary_enabled: true
  };

  private longTerm: LongTermMemoryConfig = {
    semantic_enabled: true,
    episodic_enabled: true
  };

  getEpisodic(): EpisodicMemoryConfig {
    return { ...this.episodic };
  }

  updateEpisodic(patch: Partial<EpisodicMemoryConfig>): EpisodicMemoryConfig {
    this.episodic = {
      ...this.episodic,
      ...patch
    };
    return this.getEpisodic();
  }

  getShortTerm(): ShortTermMemoryConfig {
    return { ...this.shortTerm };
  }

  updateShortTerm(patch: Partial<ShortTermMemoryConfig>): ShortTermMemoryConfig {
    this.shortTerm = {
      ...this.shortTerm,
      ...patch
    };
    return this.getShortTerm();
  }

  getLongTerm(): LongTermMemoryConfig {
    return { ...this.longTerm };
  }

  updateLongTerm(patch: Partial<LongTermMemoryConfig>): LongTermMemoryConfig {
    this.longTerm = {
      ...this.longTerm,
      ...patch
    };
    return this.getLongTerm();
  }
}
