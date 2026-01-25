import type { SubtitleMode } from '@/types';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface SubtitleModeSwitchProps {
  mode: SubtitleMode;
  onChange: (mode: SubtitleMode) => void;
}

export function SubtitleModeSwitch({ mode, onChange }: SubtitleModeSwitchProps) {
  return (
    <Tabs value={mode} onValueChange={(v) => onChange(v as SubtitleMode)}>
      <TabsList className="h-8">
        <TabsTrigger value="en" className="text-xs px-2.5">EN</TabsTrigger>
        <TabsTrigger value="zh" className="text-xs px-2.5">CN</TabsTrigger>
        <TabsTrigger value="both" className="text-xs px-2.5">Both</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
