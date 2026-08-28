import { BOT_ROSTER, type BotClockConfig, type BotConfig, type PlayerColor } from '@freechesscoach/shared';
import { useMutation } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { apiPost } from '../../api/client.js';
import { BotAvatar } from '../../components/BotAvatar.js';
import { Modal } from '../../components/Modal.js';
import '../play/PlayStartPage.css';
import { BOT_TIERS, tierForElo, type BotTierId } from './botTiers.js';
import './PlayBotStartPage.css';

const PlaySessionSchema = z.object({ id: z.string() });

/** "add option for timer the user can play with or without" — a small fixed
 * set of presets rather than a free-form time-control builder, matching the
 * curated-roster philosophy the bot picker above already uses. "No timer" is
 * first/default: an untimed game is still the common case. */
const TIME_CONTROLS: { label: string; clock: BotClockConfig | null }[] = [
  { label: 'No timer', clock: null },
  { label: '3 min', clock: { initialMs: 3 * 60_000, incrementMs: 0 } },
  { label: '5 min', clock: { initialMs: 5 * 60_000, incrementMs: 0 } },
  { label: '10 min', clock: { initialMs: 10 * 60_000, incrementMs: 0 } },
  { label: '15 | 10', clock: { initialMs: 15 * 60_000, incrementMs: 10_000 } }
];

const ROSTER_BY_TIER: { tier: (typeof BOT_TIERS)[number]; bots: BotConfig[] }[] = BOT_TIERS.map((tier) => ({
  tier,
  bots: BOT_ROSTER.filter((bot) => tierForElo(bot.elo) === tier.id)
}));

/**
 * "Play vs Bot" plan: entry point for a game against one of the curated
 * preset bots. Three steps — filter by tier (optional), pick a bot, then a
 * color — mirroring PlayStartPage's mutation-then-navigate handoff and
 * color-confirm markup (reused via PlayStartPage.css's .color-confirm
 * classes, not duplicated).
 */
export function PlayBotStartPage(): ReactNode {
  const navigate = useNavigate();
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<BotTierId | 'all'>('all');
  const [timeControlIndex, setTimeControlIndex] = useState(0);

  const startMutation = useMutation({
    mutationFn: ({ studentColor, botId, clock }: { studentColor: PlayerColor; botId: string; clock: BotClockConfig | null }) =>
      apiPost('/api/sessions/play-bot', { studentColor, botId, clock }, PlaySessionSchema),
    onSuccess: (session) => navigate(`/bot-session/${session.id}`)
  });

  const selectedBot = selectedBotId ? BOT_ROSTER.find((bot) => bot.id === selectedBotId) : undefined;

  function handlePickColor(studentColor: PlayerColor): void {
    if (!selectedBotId) return;
    const clock = TIME_CONTROLS[timeControlIndex]?.clock ?? null;
    startMutation.mutate({ studentColor, botId: selectedBotId, clock });
  }

  function handleRandomColor(): void {
    handlePickColor(Math.random() < 0.5 ? 'white' : 'black');
  }

  return (
    <div className="page play-bot-start-page">
      <header className="play-bot-start-page__hero">
        <p className="play-bot-start-page__eyebrow">30 opponents · 300–2300</p>
        <h1>Play a bot</h1>
        <p className="play-bot-start-page__subtitle">Pick an opponent that matches your level, then choose your side.</p>
      </header>

      <div className="play-bot-start-page__filters" role="group" aria-label="Filter by skill tier">
        <button
          type="button"
          className={tierFilter === 'all' ? 'is-active' : undefined}
          onClick={() => setTierFilter('all')}
        >
          All
          <span className="play-bot-start-page__filter-count">{BOT_ROSTER.length}</span>
        </button>
        {ROSTER_BY_TIER.map(({ tier, bots }) => (
          <button
            key={tier.id}
            type="button"
            data-bot-tier={tier.id}
            className={tierFilter === tier.id ? 'is-active' : undefined}
            onClick={() => setTierFilter(tier.id)}
          >
            <span className="play-bot-start-page__filter-dot" aria-hidden="true" />
            {tier.label}
            <span className="play-bot-start-page__filter-count">{bots.length}</span>
          </button>
        ))}
      </div>

      <div role="radiogroup" aria-label="Choose a bot" className="play-bot-start-page__roster">
        {ROSTER_BY_TIER.filter(({ tier }) => tierFilter === 'all' || tierFilter === tier.id).map(({ tier, bots }) => (
          <section key={tier.id} className="play-bot-start-page__tier-section" data-bot-tier={tier.id}>
            <h2 className="play-bot-start-page__tier-heading">
              <span className="play-bot-start-page__tier-dot" aria-hidden="true" />
              {tier.label}
            </h2>
            <div className="play-bot-start-page__grid">
              {bots.map((bot) => (
                <label
                  key={bot.id}
                  className={`bot-card${selectedBotId === bot.id ? ' is-selected' : ''}`}
                  data-bot-tier={tier.id}
                >
                  <input
                    type="radio"
                    name="bot"
                    className="visually-hidden"
                    checked={selectedBotId === bot.id}
                    onChange={() => setSelectedBotId(bot.id)}
                  />
                  <span className="bot-card__avatar-wrap">
                    <BotAvatar avatarIndex={bot.avatarIndex} size="grid" />
                    {selectedBotId === bot.id && (
                      <span className="bot-card__check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </span>
                  <span className="bot-card__body">
                    <span className="bot-card__name-row">
                      <span className="bot-card__name">{bot.name}</span>
                      <span className="bot-card__elo">{bot.elo}</span>
                    </span>
                    <span className="bot-card__description">{bot.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>

      {selectedBot && (
        <Modal title={selectedBot.name} onClose={() => setSelectedBotId(null)}>
          <div className="play-bot-start-page__summary">
            <div className="play-bot-start-page__summary-bot">
              <BotAvatar avatarIndex={selectedBot.avatarIndex} size="panel" />
              <span className="play-bot-start-page__summary-bot-info">
                <span className="play-bot-start-page__summary-bot-elo">{selectedBot.elo}</span>
                <span className="play-bot-start-page__summary-bot-description">{selectedBot.description}</span>
              </span>
            </div>

            <div className="play-bot-start-page__time-controls" role="radiogroup" aria-label="Time control">
              {TIME_CONTROLS.map((option, index) => (
                <button
                  key={option.label}
                  type="button"
                  role="radio"
                  aria-checked={timeControlIndex === index}
                  className={timeControlIndex === index ? 'is-selected' : undefined}
                  onClick={() => setTimeControlIndex(index)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="color-confirm">
              <div className="color-confirm__options">
                <button
                  type="button"
                  className="play-bot-start-page__color-button play-bot-start-page__color-button--white"
                  disabled={startMutation.isPending}
                  onClick={() => handlePickColor('white')}
                >
                  Play as White
                </button>
                <button
                  type="button"
                  className="play-bot-start-page__color-button play-bot-start-page__color-button--black"
                  disabled={startMutation.isPending}
                  onClick={() => handlePickColor('black')}
                >
                  Play as Black
                </button>
                <button
                  type="button"
                  className="play-bot-start-page__color-button play-bot-start-page__color-button--random"
                  disabled={startMutation.isPending}
                  onClick={handleRandomColor}
                >
                  Random
                </button>
              </div>
            </div>

            {startMutation.isError && (
              <p role="alert" className="play-start-page__error">
                Could not start a game. Please try again.
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
