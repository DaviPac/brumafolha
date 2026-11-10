// An immediate-mode 2D renderer in the spirit of the canvas the web version drew with: textured quads and filled
// rectangles in pixel coordinates (top-left origin) into a low-resolution render texture, batched by texture.
using System.Collections.Generic;
using UnityEngine;

namespace Brumafolha
{
    public static class Gfx
    {
        public const int NORMAL = 0, ADD = 1;
        static Material sprite, add, reflect;
        public static Texture2D white;
        static Texture curTex; static int curMode = -1; static bool inBatch;
        static RenderTexture curTarget;
        /// <summary>Like ctx.globalAlpha: multiplies every draw.</summary>
        public static float alpha = 1;
        /// <summary>When set, everything is mirrored about this y (a canvas translate + scale(1, -1)).</summary>
        public static float? flipAxis;

        public static void Init()
        {
            if (sprite != null) return;
            sprite = new Material(Shader.Find("Brum/Sprite"));
            add = new Material(Shader.Find("Brum/Add"));
            reflect = new Material(Shader.Find("Brum/Reflect"));
            white = new Texture2D(1, 1, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point };
            white.SetPixel(0, 0, Color.white); white.Apply();
        }

        public static RenderTexture NewTarget(int w, int h)
        {
            var rt = new RenderTexture(w, h, 0, RenderTextureFormat.ARGB32) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp, useMipMap = false };
            rt.Create();
            return rt;
        }

        /// <summary>Start drawing into a target (null: the screen), optionally clearing it.</summary>
        public static void Begin(RenderTexture target, Color? clear = null)
        {
            Flush();
            if (active) GL.PopMatrix();
            else outer = RenderTexture.active; // the camera's own target (in the editor, the Game view's)
            active = true;
            curTarget = target;
            RenderTexture.active = target;
            GL.PushMatrix();
            int w = target != null ? target.width : Screen.width, h = target != null ? target.height : Screen.height;
            GL.LoadPixelMatrix(0, w, h, 0);
            if (clear.HasValue) GL.Clear(false, true, clear.Value);
            alpha = 1; flipAxis = null;
        }
        public static void End()
        {
            Flush();
            if (active) GL.PopMatrix();
            active = false;
            curTarget = null;
            RenderTexture.active = outer;
        }
        static bool active;
        static RenderTexture outer;
        public static RenderTexture Target => curTarget;

        static void Use(Texture t, int mode)
        {
            if (inBatch && t == curTex && mode == curMode) return;
            Flush();
            var m = mode == ADD ? add : sprite;
            m.mainTexture = t;
            m.SetPass(0);
            GL.Begin(GL.QUADS);
            inBatch = true; curTex = t; curMode = mode;
        }
        public static void Flush()
        {
            if (inBatch) { GL.End(); inBatch = false; }
            curTex = null; curMode = -1;
        }

        static float Fy(float y) => flipAxis.HasValue ? flipAxis.Value * 2 - y : y;

        static void Vert(float x, float y, float u, float v) { GL.TexCoord2(u, v); GL.Vertex3(x, Fy(y), 0); }

        /// <summary>drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh), tinted. A negative dh flips the picture vertically.</summary>
        public static void Draw(Img img, float sx, float sy, float sw, float sh, float dx, float dy, float dw, float dh, Color tint, int mode = NORMAL)
        {
            if (img == null || sw <= 0 || sh <= 0) return;
            tint.a *= alpha;
            if (tint.a <= 0.001f) return;
            Use(img.tex, mode);
            float tw = img.tex.width, th = img.tex.height;
            float u0 = (img.x + sx) / tw, u1 = (img.x + sx + sw) / tw;
            float v0 = 1 - (img.y + sy) / th, v1 = 1 - (img.y + sy + sh) / th;
            GL.Color(tint);
            Vert(dx, dy, u0, v0); Vert(dx + dw, dy, u1, v0); Vert(dx + dw, dy + dh, u1, v1); Vert(dx, dy + dh, u0, v1);
        }
        public static void Draw(Img img, float dx, float dy) { if (img != null) Draw(img, 0, 0, img.w, img.h, dx, dy, img.w, img.h, Color.white); }
        public static void Draw(Img img, float dx, float dy, Color tint, int mode = NORMAL) { if (img != null) Draw(img, 0, 0, img.w, img.h, dx, dy, img.w, img.h, tint, mode); }
        public static void Draw(Img img, float dx, float dy, float dw, float dh, Color tint, int mode = NORMAL) { if (img != null) Draw(img, 0, 0, img.w, img.h, dx, dy, dw, dh, tint, mode); }
        public static void DrawPart(Img img, float sx, float sy, float sw, float sh, float dx, float dy) => Draw(img, sx, sy, sw, sh, dx, dy, sw, sh, Color.white);

        /// <summary>A picture rotated a quarter turn clockwise about its centre (a fallen party member).</summary>
        public static void DrawRotated90(Img img, float cx, float cy, Color tint)
        {
            tint.a *= alpha;
            Use(img.tex, NORMAL);
            float tw = img.tex.width, th = img.tex.height;
            float u0 = img.x / tw, u1 = (img.x + img.w) / tw, v0 = 1 - img.y / th, v1 = 1 - (img.y + img.h) / th;
            float hw = img.w / 2f, hh = img.h / 2f;
            GL.Color(tint);
            // rotate (x, y) -> (-y, x): the top of the picture lies to the right
            Vert(cx + hh, cy - hw, u0, v0); Vert(cx + hh, cy + hw, u1, v0); Vert(cx - hh, cy + hw, u1, v1); Vert(cx - hh, cy - hw, u0, v1);
        }

        public static void Fill(float x, float y, float w, float h, Color c, int mode = NORMAL)
        {
            c.a *= alpha;
            if (c.a <= 0.001f) return;
            Use(white, mode);
            GL.Color(c);
            Vert(x, y, 0, 1); Vert(x + w, y, 1, 1); Vert(x + w, y + h, 1, 0); Vert(x, y + h, 0, 0);
        }
        /// <summary>A 1-pixel rectangle outline.</summary>
        public static void StrokeRect(float x, float y, float w, float h, Color c)
        {
            Fill(x, y, w, 1, c); Fill(x, y + h - 1, w, 1, c); Fill(x, y + 1, 1, h - 2, c); Fill(x + w - 1, y + 1, 1, h - 2, c);
        }

        /// <summary>Composite a reflection target onto the current one: rows rippled sideways, cut to the water mask.</summary>
        public static void Reflection(RenderTexture refl, Texture2D mask, float camX, float camY, int vw, int vh, float time, Color tintC, float a)
        {
            Flush();
            reflect.mainTexture = refl;
            reflect.SetTexture("_Mask", mask);
            reflect.SetColor("_Tint", tintC);
            reflect.SetPass(0);
            GL.Begin(GL.QUADS);
            GL.Color(new Color(1, 1, 1, a));
            float mw = mask.width, mh = mask.height;
            for (int y = 0; y < vh; y += 2)
            {
                float off = Mathf.Round(Mathf.Sin(time * 1.8f + (y + camY) * 0.22f) * 1.2f + Mathf.Sin(time * 0.7f + (y + camY) * 0.05f) * 0.8f);
                float v0 = 1 - y / (float)vh, v1 = 1 - (y + 2) / (float)vh;
                float x0 = off, x1 = vw + off;
                float m0x = (camX + x0) / mw, m1x = (camX + x1) / mw, m0y = 1 - (camY + y) / mh, m1y = 1 - (camY + y + 2) / mh;
                GL.MultiTexCoord2(0, 0, v0); GL.MultiTexCoord2(1, m0x, m0y); GL.Vertex3(x0, y, 0);
                GL.MultiTexCoord2(0, 1, v0); GL.MultiTexCoord2(1, m1x, m0y); GL.Vertex3(x1, y, 0);
                GL.MultiTexCoord2(0, 1, v1); GL.MultiTexCoord2(1, m1x, m1y); GL.Vertex3(x1, y + 2, 0);
                GL.MultiTexCoord2(0, 0, v1); GL.MultiTexCoord2(1, m0x, m1y); GL.Vertex3(x0, y + 2, 0);
            }
            GL.End();
        }

        /// <summary>Draw a whole render texture (or any texture) stretched over a rectangle.</summary>
        public static void Blit(Texture t, float x, float y, float w, float h, Color tint, int mode = NORMAL)
        {
            tint.a *= alpha;
            Use(t, mode);
            GL.Color(tint);
            Vert(x, y, 0, 1); Vert(x + w, y, 1, 1); Vert(x + w, y + h, 1, 0); Vert(x, y + h, 0, 0);
        }

        public static Color Rgba(int r, int g, int b, float a = 1) => new Color(r / 255f, g / 255f, b / 255f, a);
        public static Color Hex(string h, float a = 1) { var c = Col.Hex(h); return new Color((float)c.r / 255f, (float)c.g / 255f, (float)c.b / 255f, a); }
    }
}
