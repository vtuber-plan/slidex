import { t, useLocale } from "./i18n";
import { useState } from "react";
import { Button, Dialog } from "@radix-ui/themes";
import { History } from "lucide-react";
import { useEditor } from "./store";
import { readRevisions, type Revision } from "./revisions";
export function HistoryDialog() {
  useLocale();
  const s = useEditor(),
    [open, setOpen] = useState(false),
    [loading,setLoading]=useState(false),
    [list, setList] = useState<Revision[]>([]);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button
          aria-label={t("本地版本历史")}
          variant="ghost"
          onClick={() => {setList([]);setLoading(true);void readRevisions(s.file).then(setList).catch(e=>useEditor.setState({error:String(e)})).finally(()=>setLoading(false));}}
        >
          <History size={17} />
        </Button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="600px">
        <Dialog.Title>{t("本地版本历史")}</Dialog.Title>
        <Dialog.Description mb="4">
          {t(
            "版本与恢复草稿保存在本机，跨应用重启保留。恢复会产生一条可撤销的编辑记录。",
          )}
        </Dialog.Description>
        {loading ? <p role="status">{t('正在读取版本历史…')}</p> : list.length ? (
          list.map((revision, i) => (
            <div key={i} className="history-row">
              <span>{revision.draft?t('未保存的恢复草稿')+' · ':''}{new Date(revision.time).toLocaleString()}</span>
              <Button
                size="1"
                variant="soft"
                onClick={() => {
                  if (s.applySource(revision.xml)) setOpen(false);
                }}
              >
                {t("恢复此版本")}
              </Button>
            </div>
          ))
        ) : (
          <p>{t("保存文档后会出现版本记录。")}</p>
        )}
        <Dialog.Close>
          <Button variant="soft" mt="4">
            {t("关闭")}
          </Button>
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Root>
  );
}
