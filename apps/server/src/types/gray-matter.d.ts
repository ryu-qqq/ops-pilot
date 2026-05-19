// gray-matter 는 타입을 동봉하지 않음. 사용하는 표면만 최소 선언.
declare module "gray-matter" {
  interface GrayMatterFile {
    data: Record<string, unknown>;
    content: string;
  }
  function matter(input: string): GrayMatterFile;
  export default matter;
}
