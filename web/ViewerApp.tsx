import { t, useLocale } from "./i18n";
import { useEffect, useState } from "react";
import { Theme, Button } from "@radix-ui/themes";
import { Player, Presenter, PreviewGrid } from "./Player";
import { parseSlideX } from "../src/ir";
import type { Deck } from "../src/types";
export default function ViewerApp() {
  useLocale();
  const [deck, setDeck] = useState<Deck | null>(null),
    [error, setError] = useState(""),
    [page, setPage] = useState(
      Number(new URLSearchParams(location.search).get("page")) || 0,
    ),
    [playing, setPlaying] = useState(location.pathname !== "/preview");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/deck")
      .then((r) => {
        if (!r.ok) throw Error(t("无法读取文档"));
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setDeck(parseSlideX(data.xml).deck);
      })
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, []);
  const session =
    new URLSearchParams(location.search).get("session") || "default";
  return (
    <Theme
      appearance={
        localStorage.getItem("slidex-appearance") === "dark" ? "dark" : "light"
      }
      accentColor="indigo"
    >
      <div className="studio-shell">
        {!deck ? (
          <main className="loading">{error || t("正在载入演示文稿…")}</main>
        ) : location.pathname === "/present-speaker" ? (
          <Presenter initialDeck={deck} session={session} />
        ) : !playing ? (
          <div className="preview-overlay">
            <header>
              <h2>{deck.title}</h2>
              <Button onClick={() => location.assign("/")}>
                {t("返回编辑器")}
              </Button>
            </header>
            <PreviewGrid
              deck={deck}
              onSelect={(i) => {
                setPage(i);
                setPlaying(true);
              }}
            />
          </div>
        ) : (
          <Player
            deck={deck}
            start={page}
            session={session}
            embedded={location.pathname === "/player"}
            onClose={
              location.pathname === "/player"
                ? undefined
                : () =>
                    location.pathname === "/preview"
                      ? setPlaying(false)
                      : location.assign("/")
            }
          />
        )}
      </div>
    </Theme>
  );
}
