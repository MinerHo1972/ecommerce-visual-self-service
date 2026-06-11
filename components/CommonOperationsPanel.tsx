"use client";

import { Eraser, Expand, Image as ImageIcon, ImagePlus, Move, Palette, Type } from "lucide-react";
import type { RenderInputs } from "@/lib/types";

type CommonOperationsPanelProps = {
  inputs: RenderInputs;
  onInputsChange: (inputs: RenderInputs) => void;
  onGoWorkspace: () => void;
};

type OperationCard = {
  title: string;
  description: string;
  status: "ready" | "workflow" | "pending";
  icon: typeof ImageIcon;
  action?: string;
};

const operations: OperationCard[] = [
  {
    title: "改文字",
    description: "修改主标题、副标题、价格和活动标签后回到工作台预览并抽卡。",
    status: "ready",
    icon: Type,
    action: "去改文字",
  },
  {
    title: "换背景",
    description: "上传背景图后会进入模板背景层；也可以清空背景图恢复模板默认背景。",
    status: "ready",
    icon: Palette,
    action: "上传背景图",
  },
  {
    title: "缩放 / 裁切主体",
    description: "通过主体位置预设控制商品图 cover 裁切焦点，适合横图、竖图快速适配。",
    status: "ready",
    icon: Move,
    action: "去调位置",
  },
  {
    title: "参考图回流",
    description: "历史成图或参考图库里的图片可带回工作台，作为商品图、背景图或参考图继续生成。",
    status: "workflow",
    icon: ImagePlus,
    action: "看参考图库",
  },
  {
    title: "抠图",
    description: "已预留入口，下一步接入背景移除服务后可一键生成透明底商品图。",
    status: "pending",
    icon: Eraser,
  },
  {
    title: "扩图",
    description: "已预留入口，下一步接入画布外延展能力，用于横竖版互转和留白扩展。",
    status: "pending",
    icon: Expand,
  },
];

function statusText(status: OperationCard["status"]) {
  if (status === "ready") return "已接入";
  if (status === "workflow") return "流程可用";
  return "待接入 API";
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function CommonOperationsPanel({ inputs, onInputsChange, onGoWorkspace }: CommonOperationsPanelProps) {
  async function handleBackgroundUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    onInputsChange({ ...inputs, backgroundImageDataUrl: dataUrl });
    onGoWorkspace();
    event.target.value = "";
  }

  async function handleProductUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    onInputsChange({ ...inputs, productImageDataUrl: dataUrl });
    onGoWorkspace();
    event.target.value = "";
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <section className="panel common-op-hero">
        <div>
          <h2>常用改图操作</h2>
          <p className="muted">
            这里放运营最常用的入口。已能通过模板输入流完成的操作直接可用；依赖专门模型 API 的能力先明确标为待接入。
          </p>
        </div>
        <div className="common-op-upload-row">
          <label className="button primary file-button">
            <ImageIcon size={16} /> 上传商品图
            <input type="file" accept="image/*" onChange={handleProductUpload} />
          </label>
          <label className="button file-button">
            <Palette size={16} /> 上传背景图
            <input type="file" accept="image/*" onChange={handleBackgroundUpload} />
          </label>
        </div>
      </section>

      <section className="common-op-grid">
        {operations.map((operation) => {
          const Icon = operation.icon;
          return (
            <article className="card common-op-card" key={operation.title}>
              <div className="card-body">
                <div className="common-op-head">
                  <span className={`common-op-icon ${operation.status}`}><Icon size={20} /></span>
                  <span className={`common-op-status ${operation.status}`}>{statusText(operation.status)}</span>
                </div>
                <p className="card-title">{operation.title}</p>
                <p className="muted">{operation.description}</p>
                {operation.action && (
                  <button
                    className="button"
                    onClick={() => {
                      if (operation.title === "参考图回流") return;
                      onGoWorkspace();
                    }}
                  >
                    {operation.action}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
