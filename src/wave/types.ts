// Общие типы для модуля «Волна».
// Канонический Track живёт в entities/track — здесь импорт + реэкспорт.

import type { Track } from "@entities/track/model/types";
export type { Track };

// "track"    — волна по одному треку (1 сид)
// "personal" — «Моя волна» (несколько сидов из библиотеки + подмешивание знакомых)
// "queue"    — «Похожие на очередь» (сиды из текущей очереди, без подмешивания библиотеки)
export type WaveMode = "track" | "personal" | "queue";

// «Сырой» трек из SC API v2 — то, что приходит в /stations и /related.
export interface ScRawTrack {
  id: number;
  title: string;
  permalink_url: string;
  duration: number;
  artwork_url: string | null;
  genre: string | null;
  tag_list: string;
  description: string | null;
  policy?: string;
  monetization_model?: string;
  publisher_metadata?: { explicit?: boolean; publisher?: string } | null;
  user: {
    id: number;
    username: string;
    avatar_url: string | null;
    permalink_url: string;
    verified?: boolean;
  };
  media?: unknown;
  release_date?: string | null;
  display_date?: string | null;
}

export interface Candidate {
  id: string; // 'sc_' + scId или локальный id
  sourceRank: number; // позиция в ответе SC, чем меньше — тем выше
  origin: "station" | "related" | "library";
  raw?: ScRawTrack; // для гостевых
  libTrack?: Track; // для подмешанных из библиотеки
  artistKey: string; // нормализованное имя артиста для антиповторов
  genres: string[];
}

export interface WaveSession {
  mode: WaveMode;
  seeds: string[]; // id треков-сидов (для personal) или [trackId] для track-режима
  startedAt: number;
  // Динамическая память сеанса
  playedIds: string[]; // что уже сыграло в этом сеансе (для антиповторов)
  bonusArtists: Record<string, number>; // буст артиста при лайке/дослушивании
  sessionDislikedArtists: string[]; // зарезервировано
  scStationCursor: Record<string, number>; // offset для пагинации stations/track:{id}
}

// like/unlike оставлены в типе, чтобы не ломать вызывающий код в, но в диспетчере
// они теперь no-op: сердечко «В любимое» — это курирующее действие (сохранить в библиотеку),
// а не сигнал алгоритму. Волна обучается по поведению: dolislushал / скипнул / добавил в библиотеку.
export type FeedbackAction =
  | "like"            // deprecated, no-op
  | "unlike"          // deprecated, no-op
  | "skip"
  | "finish"
  | "dislike"
  | "undislike"
  | "addedToLibrary"; // явный сигнал «хочу больше такого» — пользователь сохранил трек

export interface FeedbackEvent {
  action: FeedbackAction;
  trackId: string;
  playedSec?: number;
  durSec?: number;
}
