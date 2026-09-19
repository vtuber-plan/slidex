import { useState } from "react";
import { Button, Dialog } from "@radix-ui/themes";
import { History } from "lucide-react";
import { useEditor } from "./store";
import { readRevisions, type Revision } from "./revisions";
export function HistoryDialog() {
  const s = useEditor(),
    [open, setOpen] = useState(false),
    [list, setList] = useState<Revision[]>([]);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button
          aria-label="本地版本历史"
          variant="ghost"
          onClick={() => setList(readRevisions(s.file))}
        >
          <History size={17} />
        </Button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="600px">
        <Dialog.Title>本地版本历史</Dialog.Title>
        <Dialog.Description mb="4">
          保存时记录最近 20
          个版本，仅保存在当前浏览器。恢复会产生一条可撤销的编辑记录。
        </Dialog.Description>
        {list.length ? (
          list.map((revision, i) => (
            <div key={i} className="history-row">
              <span>{new Date(revision.time).toLocaleString()}</span>
              <Button
                size="1"
                variant="soft"
                onClick={() => {
                  if (s.applySource(revision.xml)) setOpen(false);
                }}
              >
                恢复此版本
              </Button>
            </div>
          ))
        ) : (
          <p>保存文档后会出现版本记录。</p>
        )}
        <Dialog.Close>
          <Button variant="soft" mt="4">
            关闭
          </Button>
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Root>
  );
}
