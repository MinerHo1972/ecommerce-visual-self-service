import { Brush, CheckCircle2, GitBranch, ImagePlus, Layers, RefreshCw, WandSparkles } from "lucide-react";

const workflowTemplates = [
  {
    key: "template-replace",
    name: "商品图套模板",
    status: "ready",
    statusLabel: "已可用",
    description: "选择产品图和模板图，框选商品区域后生成候选，由人判断下载、反馈、局部重绘或继续优化。",
    steps: ["素材输入", "区域定位", "AI 生成候选", "人审下一步"],
    icon: Layers,
  },
  {
    key: "history-optimize",
    name: "历史成图继续优化",
    status: "partial",
    statusLabel: "能力已部分接入",
    description: "从历史成图带回自助工作台，作为下一轮产品图输入继续生成分支。",
    steps: ["选择历史图", "带回工作台", "继续优化", "沉淀新分支"],
    icon: RefreshCw,
  },
  {
    key: "partial-repaint",
    name: "局部重绘修瑕疵",
    status: "partial",
    statusLabel: "能力已部分接入",
    description: "对候选图局部区域做重绘修复，适合处理产品边缘、背景瑕疵和小范围不协调。",
    steps: ["选择候选", "框选区域", "描述修改", "生成修复图"],
    icon: Brush,
  },
  {
    key: "batch-launch",
    name: "批量上新图生产",
    status: "pending",
    statusLabel: "即将接入",
    description: "面向一批商品统一套模板、批量生成候选，并按反馈结果筛选可用图。",
    steps: ["批量导入", "套用模板", "批量生成", "批量审核"],
    icon: ImagePlus,
  },
  {
    key: "text-template-reuse",
    name: "文字修改与模板复用",
    status: "pending",
    statusLabel: "即将接入",
    description: "在不覆盖原模板的前提下生成新模板版本，支持运营文案快速替换和复用。",
    steps: ["选择模板", "修改文案", "生成新版", "入模板库"],
    icon: WandSparkles,
  },
] as const;

type WorkflowTemplatesPanelProps = {
  onOpenTemplateReplace: () => void;
};

export function WorkflowTemplatesPanel({ onOpenTemplateReplace }: WorkflowTemplatesPanelProps) {
  return (
    <div className="grid workflow-template-page">
      <section className="panel workflow-template-hero">
        <div>
          <p className="eyebrow">产品 2.0</p>
          <h2>工作流模板</h2>
          <p className="muted">
            先把高频视觉生产能力整理成固定模板。当前只开放已接入流程，其它模板先展示方向，避免误触发未完成能力。
          </p>
        </div>
        <button className="button primary" onClick={onOpenTemplateReplace}>
          <GitBranch size={16} />进入商品图套模板
        </button>
      </section>

      <section className="workflow-template-grid">
        {workflowTemplates.map((template) => {
          const Icon = template.icon;
          const isReady = template.status === "ready";
          return (
            <article className={`card workflow-template-card ${template.status}`} key={template.key}>
              <div className="card-body">
                <div className="workflow-template-head">
                  <span className={`common-op-icon ${isReady ? "ready" : template.status === "partial" ? "workflow" : "pending"}`}>
                    <Icon size={20} />
                  </span>
                  <span className={`common-op-status ${isReady ? "ready" : template.status === "partial" ? "workflow" : "pending"}`}>
                    {template.statusLabel}
                  </span>
                </div>
                <h3 className="card-title">{template.name}</h3>
                <p className="muted">{template.description}</p>
                <div className="workflow-step-list">
                  {template.steps.map((step) => (
                    <span key={step}>{step}</span>
                  ))}
                </div>
                <div className="history-actions">
                  {isReady ? (
                    <button className="button primary" onClick={onOpenTemplateReplace}>
                      <CheckCircle2 size={16} />开始使用
                    </button>
                  ) : (
                    <button className="button" disabled>
                      即将接入
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
