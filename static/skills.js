/**
 * GMGUI Skill System
 * Extensible plugin architecture for display and processing skills
 */

/**
 * Skill Registry - Central hub for all skills
 */
class SkillRegistry {
  constructor() {
    this.skills = new Map();
    this.hooks = new Map();
    this.middleware = [];
    this.listeners = new Map();
  }

  register(name, skill) {
    if (!skill.execute || !skill.metadata) {
      throw new Error(`Invalid skill "${name}": must have execute() and metadata`);
    }

    this.skills.set(name, skill);
    this.emit('skill:registered', { name, skill });
    console.log(`✅ Skill registered: ${name}`);
  }

  async execute(skillName, input, context = {}) {
    const skill = this.skills.get(skillName);
    if (!skill) throw new Error(`Skill not found: ${skillName}`);

    try {
      // Run middleware
      let processedInput = input;
      for (const mw of this.middleware) {
        processedInput = await mw(processedInput, context, skillName);
      }

      // Execute skill
      const result = await skill.execute(processedInput, context);

      // Run hooks
      await this.runHooks(`skill:${skillName}:complete`, { input, result });

      return result;
    } catch (error) {
      await this.runHooks(`skill:${skillName}:error`, { input, error });
      throw error;
    }
  }

  registerMiddleware(fn) {
    this.middleware.push(fn);
  }

  onHook(event, handler) {
    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }
    this.hooks.get(event).push(handler);
  }

  async runHooks(event, data) {
    const handlers = this.hooks.get(event) || [];
    for (const handler of handlers) {
      try {
        await handler(data);
      } catch (e) {
        console.error(`Hook error for ${event}:`, e);
      }
    }
  }

  emit(event, data) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).forEach(listener => listener(data));
  }

  on(event, listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(listener);
  }

  listSkills() {
    return Array.from(this.skills.entries()).map(([name, skill]) => ({
      name,
      ...skill.metadata,
    }));
  }
}

/**
 * Display HTML Skill - Safe HTML rendering in iframe
 */
class DisplayHtmlSkill {
  constructor() {
    this.metadata = {
      name: 'Display HTML',
      description: 'Safely render HTML in sandboxed iframe',
      version: '1.0.0',
      tags: ['display', 'html', 'safe'],
    };
  }

  async execute(content, options = {}) {
    const container = document.createElement('div');
    container.className = 'skill-display-html';

    const iframe = document.createElement('iframe');
    iframe.className = 'skill-iframe';
    iframe.sandbox.add('allow-scripts');
    iframe.sandbox.add('allow-same-origin');
    iframe.style.width = options.width || '100%';
    iframe.style.height = options.height || '500px';
    iframe.style.border = '1px solid #e5e7eb';
    iframe.style.borderRadius = '0.5rem';
    iframe.style.marginTop = '1rem';

    try {
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta http-equiv="X-UA-Compatible" content="ie=edge">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="Content-Security-Policy" 
                content="default-src 'self' 'unsafe-inline' 'unsafe-eval'; 
                         script-src 'self' 'unsafe-inline' 'unsafe-eval';
                         style-src 'self' 'unsafe-inline'">
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            html, body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              width: 100%;
              height: 100%;
              overflow: auto;
              background: white;
              color: #1f2937;
            }
            body {
              padding: 1rem;
            }
            * {
              max-width: 100%;
            }
            img, video, iframe {
              display: block;
              margin: 1rem 0;
              border-radius: 0.5rem;
            }
            pre {
              background: #f3f4f6;
              padding: 1rem;
              border-radius: 0.5rem;
              overflow-x: auto;
            }
            code {
              font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
              font-size: 0.875rem;
            }
          </style>
        </head>
        <body>${this.sanitizeHtml(content)}</body>
        </html>
      `);
      doc.close();

      container.appendChild(iframe);
      return container;
    } catch (error) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'skill-error';
      errorDiv.innerHTML = `<strong>Error rendering HTML:</strong> ${error.message}`;
      container.appendChild(errorDiv);
      return container;
    }
  }

  sanitizeHtml(html) {
    // Basic sanitization - remove script tags and event handlers
    const temp = document.createElement('div');
    temp.textContent = html;
    let sanitized = temp.innerHTML;

    // Remove script tags
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // Remove on* event handlers
    sanitized = sanitized.replace(/\son\w+\s*=\s*['"][^'"]*['"]/gi, '');
    sanitized = sanitized.replace(/\son\w+\s*=\s*[^\s>]*/gi, '');

    return sanitized;
  }
}

/**
 * Display Image Skill - Image display with metadata
 */
class DisplayImageSkill {
  constructor() {
    this.metadata = {
      name: 'Display Image',
      description: 'Display images from filesystem with metadata',
      version: '1.0.0',
      tags: ['display', 'image', 'file'],
    };
  }

  async execute(path, options = {}) {
    const container = document.createElement('div');
    container.className = 'skill-display-image';

    try {
      // Create image wrapper
      const wrapper = document.createElement('div');
      wrapper.style.marginTop = '1rem';

      // Create image element
      const img = document.createElement('img');
      img.src = this.normalizePath(path);
      img.alt = path;
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.borderRadius = '0.5rem';
      img.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
      img.style.marginBottom = '0.5rem';

      // Load image to get dimensions
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error(`Failed to load image: ${path}`));
      });

      // Create info panel
      const info = document.createElement('div');
      info.className = 'skill-image-info';
      info.style.fontSize = '0.875rem';
      info.style.color = '#6b7280';
      info.style.marginTop = '0.5rem';
      info.innerHTML = `
        <div>📁 <strong>${this.getFileName(path)}</strong></div>
        <div>📏 ${img.naturalWidth} × ${img.naturalHeight} px</div>
        <div>🔗 <code>${path}</code></div>
      `;

      wrapper.appendChild(img);
      wrapper.appendChild(info);
      container.appendChild(wrapper);

      return container;
    } catch (error) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'skill-error';
      errorDiv.innerHTML = `<strong>Error loading image:</strong> ${error.message}`;
      container.appendChild(errorDiv);
      return container;
    }
  }

  normalizePath(path) {
    // Support relative and absolute paths
    if (path.startsWith('/')) return path;
    if (path.startsWith('./')) return path;
    return './' + path;
  }

  getFileName(path) {
    return path.split('/').pop();
  }
}

/**
 * Display PDF Skill - PDF rendering
 */
class DisplayPdfSkill {
  constructor() {
    this.metadata = {
      name: 'Display PDF',
      description: 'Display PDF files with page navigation',
      version: '1.0.0',
      tags: ['display', 'pdf', 'file'],
    };
  }

  async execute(path, options = {}) {
    const container = document.createElement('div');
    container.className = 'skill-display-pdf';

    try {
      // Create PDF viewer wrapper
      const wrapper = document.createElement('div');
      wrapper.style.marginTop = '1rem';
      wrapper.style.border = '1px solid #e5e7eb';
      wrapper.style.borderRadius = '0.5rem';
      wrapper.style.overflow = 'hidden';

      // Create controls
      const controls = document.createElement('div');
      controls.style.padding = '0.75rem';
      controls.style.background = '#f3f4f6';
      controls.style.display = 'flex';
      controls.style.gap = '0.5rem';
      controls.style.alignItems = 'center';

      const linkBtn = document.createElement('a');
      linkBtn.href = this.normalizePath(path);
      linkBtn.download = true;
      linkBtn.className = 'btn btn-secondary';
      linkBtn.textContent = '⬇️ Download PDF';
      linkBtn.style.padding = '0.5rem 1rem';
      linkBtn.style.background = 'white';
      linkBtn.style.border = '1px solid #d1d5db';
      linkBtn.style.borderRadius = '0.25rem';
      linkBtn.style.cursor = 'pointer';
      linkBtn.style.textDecoration = 'none';
      linkBtn.style.fontSize = '0.875rem';

      const infoSpan = document.createElement('span');
      infoSpan.style.marginLeft = 'auto';
      infoSpan.style.fontSize = '0.875rem';
      infoSpan.style.color = '#6b7280';
      infoSpan.textContent = `📄 ${this.getFileName(path)}`;

      controls.appendChild(linkBtn);
      controls.appendChild(infoSpan);

      // Create embed
      const embed = document.createElement('embed');
      embed.src = this.normalizePath(path);
      embed.type = 'application/pdf';
      embed.style.width = '100%';
      embed.style.height = options.height || '600px';

      wrapper.appendChild(controls);
      wrapper.appendChild(embed);
      container.appendChild(wrapper);

      return container;
    } catch (error) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'skill-error';
      errorDiv.innerHTML = `<strong>Error loading PDF:</strong> ${error.message}`;
      container.appendChild(errorDiv);
      return container;
    }
  }

  normalizePath(path) {
    if (path.startsWith('/')) return path;
    if (path.startsWith('./')) return path;
    return './' + path;
  }

  getFileName(path) {
    return path.split('/').pop();
  }
}

/**
 * Message Parser - Detect and invoke skills in messages
 */
class MessageParser {
  constructor(skillRegistry) {
    this.skills = skillRegistry;
    this.patterns = new Map();
    this.setupDefaultPatterns();
  }

  setupDefaultPatterns() {
    // HTML code blocks: ```html\n...\n```
    this.registerPattern('displayhtml', {
      pattern: /```html\n([\s\S]*?)\n```/,
      extract: (match) => match[1],
    });

    // PDF references: pdf:path/to/file.pdf
    this.registerPattern('displaypdf', {
      pattern: /pdf:\s*([\w\/.~-]+\.pdf)/gi,
      extract: (match) => match[1],
    });

    // Image references: image:path/to/file.png
    this.registerPattern('displayimage', {
      pattern: /image:\s*([\w\/.~-]+\.(?:png|jpg|jpeg|gif|svg))/gi,
      extract: (match) => match[1],
    });
  }

  registerPattern(skill, config) {
    this.patterns.set(skill, config);
  }

  async parseAndRender(message) {
    const container = document.createElement('div');
    container.className = 'message-content';

    let remaining = message;

    for (const [skillName, config] of this.patterns) {
      const match = remaining.match(config.pattern);

      if (match) {
        // Add text before match
        const beforeText = remaining.substring(0, match.index);
        if (beforeText) {
          const textDiv = document.createElement('div');
          textDiv.textContent = beforeText;
          container.appendChild(textDiv);
        }

        // Extract skill input
        const skillInput = config.extract(match);

        // Execute skill
        try {
          const result = await this.skills.execute(skillName, skillInput, {
            message,
            parser: this,
          });
          container.appendChild(result);
        } catch (error) {
          const errorDiv = document.createElement('div');
          errorDiv.className = 'skill-error';
          errorDiv.innerHTML = `<strong>Skill error (${skillName}):</strong> ${error.message}`;
          container.appendChild(errorDiv);
        }

        // Continue with remaining text
        remaining = remaining.substring(match.index + match[0].length);
      }
    }

    // Add remaining text
    if (remaining) {
      const textDiv = document.createElement('div');
      textDiv.textContent = remaining;
      container.appendChild(textDiv);
    }

    return container;
  }
}

// Create and export global skill registry
window.gmguiSkills = new SkillRegistry();

// Register built-in skills
window.gmguiSkills.register('displayhtml', new DisplayHtmlSkill());
window.gmguiSkills.register('displaypdf', new DisplayPdfSkill());
window.gmguiSkills.register('displayimage', new DisplayImageSkill());

// Create global message parser
window.gmguiParser = new MessageParser(window.gmguiSkills);

console.log('✅ Skills system initialized');
console.log('Available skills:', window.gmguiSkills.listSkills());
