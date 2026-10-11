"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { PageHeader, Panel, PanelBody, PanelHeader } from "@/components/ds";
import { OptionCard, OptionGroup } from "./option-card";
import { type DefaultViewport, useSettings } from "./use-settings";

const THEMES = [
  { value: "light", title: "Light", description: "Light surfaces always." },
  { value: "dark", title: "Dark", description: "Dark surfaces always." },
  {
    value: "system",
    title: "Match this device",
    description: "Follow the operating system setting.",
  },
];

const DENSITIES = [
  {
    value: "comfortable",
    title: "Comfortable",
    description: "More space around table rows and list items.",
  },
  {
    value: "compact",
    title: "Compact",
    description: "Tighter rows, so more fit on one screen.",
  },
] as const;

const METHODS = [
  {
    value: "hybrid",
    title: "Detector and rules",
    description: "Rules read the page; the detector adds what they cannot see.",
  },
  {
    value: "rule_only",
    title: "Rules only",
    description: "No detector. Fewer criteria can be decided.",
  },
] as const;

const VIEWPORTS: { value: DefaultViewport; title: string; note: string }[] = [
  { value: "desktop", title: "Desktop", note: "1440 × 900 px" },
  { value: "mobile", title: "Mobile", note: "390 × 844 px" },
];

export function SettingsScreen() {
  const [settings, update] = useSettings();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => setMounted(true), []);

  function saved(what: string) {
    setMessage(`${what} saved on this device.`);
  }

  function toggleViewport(value: DefaultViewport) {
    const has = settings.viewports.includes(value);
    if (has && settings.viewports.length === 1) {
      setMessage("Keep at least one default viewport.");
      return;
    }
    update({
      viewports: has
        ? settings.viewports.filter((v) => v !== value)
        : [...settings.viewports, value],
    });
    saved("Default viewports");
  }

  const activeTheme = mounted ? (theme ?? "system") : "";

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Settings"
        description="Theme, density, keyboard shortcuts and default audit options. They are stored in this browser only."
      />
      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
      <div className="grid gap-4">
        <Panel aria-labelledby="set-theme">
          <PanelHeader id="set-theme" title="Appearance" />
          <PanelBody className="grid gap-6">
            <OptionGroup radio legend="Theme" className="[&_legend]:text-body">
              {THEMES.map((item) => (
                <OptionCard
                  key={item.value}
                  name="theme"
                  value={item.value}
                  checked={activeTheme === item.value}
                  onChange={() => {
                    setTheme(item.value);
                    saved("Theme");
                  }}
                  title={item.title}
                  description={item.description}
                />
              ))}
            </OptionGroup>
            <OptionGroup
              radio
              legend="Density"
              className="[&_legend]:text-body"
            >
              {DENSITIES.map((item) => (
                <OptionCard
                  key={item.value}
                  name="density"
                  value={item.value}
                  checked={settings.density === item.value}
                  onChange={() => {
                    update({ density: item.value });
                    saved("Density");
                  }}
                  title={item.title}
                  description={item.description}
                />
              ))}
            </OptionGroup>
          </PanelBody>
        </Panel>

        <Panel aria-labelledby="set-keys">
          <PanelHeader id="set-keys" title="Keyboard" />
          <PanelBody>
            <OptionCard
              type="checkbox"
              name="shortcuts"
              checked={settings.shortcuts}
              onChange={() => {
                update({ shortcuts: !settings.shortcuts });
                saved("Shortcut setting");
              }}
              title="Single-key shortcuts"
              description="J and K move through the review queue, C, X and U record a decision. They never fire while you type in a field. Turn them off if they clash with assistive technology."
            />
          </PanelBody>
        </Panel>

        <Panel aria-labelledby="set-audit">
          <PanelHeader id="set-audit" title="Default audit options" />
          <PanelBody className="grid gap-6">
            <OptionGroup legend="Viewports" className="[&_legend]:text-body">
              {VIEWPORTS.map((item) => (
                <OptionCard
                  key={item.value}
                  type="checkbox"
                  name="viewports"
                  value={item.value}
                  checked={settings.viewports.includes(item.value)}
                  onChange={() => toggleViewport(item.value)}
                  title={item.title}
                  description={item.note}
                />
              ))}
            </OptionGroup>
            <OptionGroup radio legend="Method" className="[&_legend]:text-body">
              {METHODS.map((item) => (
                <OptionCard
                  key={item.value}
                  name="method"
                  value={item.value}
                  checked={settings.method === item.value}
                  onChange={() => {
                    update({ method: item.value });
                    saved("Default method");
                  }}
                  title={item.title}
                  description={item.description}
                />
              ))}
            </OptionGroup>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
