import React from "react";
import "./importLocal.css";
import BookModel from "../../models/Book";
import { getMimeType } from "../../constants/mimetype";
import { fetchMD5 } from "../../utils/fileUtils/md5Util";
import { Trans } from "react-i18next";
import Dropzone from "react-dropzone";

import { ImportLocalProps, ImportLocalState } from "./interface";
import RecordRecent from "../../utils/readUtils/recordRecent";
import { isElectron } from "react-device-detect";
import { withRouter } from "react-router-dom";
import BookUtil from "../../utils/fileUtils/bookUtil";
import { fetchFileFromPath } from "../../utils/fileUtils/fileUtil";
import toast from "react-hot-toast";
import StorageUtil from "../../utils/serviceUtils/storageUtil";

import ShelfUtil from "../../utils/readUtils/shelfUtil";
declare var window: any;
let clickFilePath = "";

// 导入本地文件
class ImportLocal extends React.Component<ImportLocalProps, ImportLocalState> {
  private focusListener: any;
  private resizeListener: any;
  
  // 构造函数
  constructor(props: ImportLocalProps) {
    super(props);
    this.state = {
      isOpenFile: false,
      width: document.body.clientWidth,
    };
  }

  // 挂载组件
  componentDidMount() {
    if (isElectron) {
      const { ipcRenderer } = window.require("electron");
      if (!localStorage.getItem("storageLocation")) {
        localStorage.setItem(
          "storageLocation",
          ipcRenderer.sendSync("storage-location", "ping")
        );
      }

      const filePath = ipcRenderer.sendSync("get-file-data");
      if (filePath && filePath !== ".") {
        this.handleFilePath(filePath);
      }
      this.focusListener = window.addEventListener(
        "focus",
        this.handleFocus,
        false
      );
    }
    this.resizeListener = window.addEventListener("resize", this.handleResize);
  }

  componentWillUnmount() {
    if (this.focusListener) {
      window.removeEventListener("focus", this.handleFocus);
    }
    if (this.resizeListener) {  
      window.removeEventListener("resize", this.handleResize);
    }
  }

  handleFocus = (event) => {
    const { ipcRenderer } = window.require("electron");
    const _filePath = ipcRenderer.sendSync("get-file-data");
    if (_filePath && _filePath !== ".") {
      this.handleFilePath(_filePath);
    }
  };

  handleResize = () => {
    this.setState({ width: document.body.clientWidth });
  };

  // 处理文件路径
  handleFilePath = async (filePath: string) => {
    clickFilePath = filePath;
    // 如果发现重复的文件，则跳转
    let md5 = await fetchMD5(await fetchFileFromPath(filePath));
    if ([...(this.props.books || []), ...this.props.deletedBooks].length > 0) {
      let isRepeat = false;
      let repeatBook: BookModel | null = null;
      [...(this.props.books || []), ...this.props.deletedBooks].forEach(
        (item) => {
          if (item.md5 === md5) {
            isRepeat = true;
            repeatBook = item;
          }
        }
      );
      if (isRepeat && repeatBook) {
        this.handleJump(repeatBook);
        return;
      }
    }
    // 获取文件
    const fileTemp = await fetchFileFromPath(filePath);

    this.setState({ isOpenFile: true }, async () => {
      await this.getMd5WithBrowser(fileTemp);
    });
  };

  // 跳转到指定的书籍
  handleJump = (book: BookModel) => {
    localStorage.setItem("tempBook", JSON.stringify(book));
    BookUtil.RedirectBook(book, this.props.t, this.props.history);
    this.props.history.push("/manager/home");
  };

  // 向量化文件
  async vectorizeFile(file_content: ArrayBuffer, file_type: string, filename: string): Promise<boolean> {
    const mimeType = getMimeType(file_type) || 'application/octet-stream';
    const formData = new FormData();
    formData.append("files", new Blob([file_content], { type: mimeType }), filename);
    formData.append("knowledge_base_name", "Jason Test");
    formData.append("override", "false");
    formData.append("to_vector_store", "true");
    formData.append("chunk_size", "750"); 
    formData.append("chunk_overlap", "150");
    formData.append("zh_title_enhance", "false");
    formData.append("docs", "{}");
    formData.append("not_refresh_vs_cache", "false");

    console.info("向量化文件:" + filename);

    return toast.promise(
      fetch("http://127.0.0.1:7861/knowledge_base/upload_docs", {
        method: "POST", 
        body: formData
      }).then(async (response) => {
        if (!response.ok) {
          const error = await response.json();
          throw new Error("向量化错误：" + error.msg);
        }
        console.info("向量化文件成功:" + filename);
      }),
      {
        loading: "正在向量化文件...",
        success: "向量化完成",
        error: (err) => `向量化文件失败,文件不能添加。<br/> ${err.message}`,
      }
    ).then(() => true)
    .catch((err) => {
      console.error(err);
      return false; 
    });
  }

  // 添加书籍
  handleAddBook = (book: BookModel, buffer: ArrayBuffer) => {
    return new Promise<void>((resolve, reject) => {
      if (this.state.isOpenFile) {
        StorageUtil.getReaderConfig("isImportPath") !== "yes" &&
          StorageUtil.getReaderConfig("isPreventAdd") !== "yes" &&
          BookUtil.addBook(book.key, buffer);
        if (StorageUtil.getReaderConfig("isPreventAdd") === "yes") {
          this.handleJump(book);

          this.setState({ isOpenFile: false });

          return resolve();
        }
      } else {
        StorageUtil.getReaderConfig("isImportPath") !== "yes" &&
          BookUtil.addBook(book.key, buffer);
      }

      // 更新书籍列表
      let bookArr = [...(this.props.books || []), ...this.props.deletedBooks];
      if (bookArr == null) {
        bookArr = [];
      }
      bookArr.push(book);
      this.props.handleReadingBook(book);
      RecordRecent.setRecent(book.key);
      // 保存书籍列表到localforage
      window.localforage
        .setItem("books", bookArr)
        .then(() => {
          this.props.handleFetchBooks();
          if (this.props.mode === "shelf") {
            let shelfTitles = Object.keys(ShelfUtil.getShelf());
            ShelfUtil.setShelf(shelfTitles[this.props.shelfIndex], book.key);
          }
          toast.success(this.props.t("Addition successful"));
          setTimeout(() => {
            this.state.isOpenFile && this.handleJump(book);
            if (
              StorageUtil.getReaderConfig("isOpenInMain") === "yes" &&
              this.state.isOpenFile
            ) {
              this.setState({ isOpenFile: false });
              return;
            }
            this.setState({ isOpenFile: false });
            this.props.history.push("/manager/home");
          }, 100);
          return resolve();
        })
        .catch(() => {
          toast.error(this.props.t("Import failed"));
          return resolve();
        });
    });
  };

  getMd5WithBrowser = async (file: any) => {
    return new Promise<void>(async (resolve, reject) => {
      const md5 = await fetchMD5(file);
      if (!md5) {
        toast.error(this.props.t("Import failed"));
        return resolve();
      } else {
        try {
          await this.handleBook(file, md5);
        } catch (error) {
          console.log(error);
        }

        return resolve();
      }
    });
  };

  handleBook = (file: any, md5: string) => {
    let extension = (file.name as string)
      .split(".")
      .reverse()[0]
      .toLocaleLowerCase();
    let bookName = file.name.substr(0, file.name.length - extension.length - 1);
    let result: BookModel | string;
    return new Promise<void>((resolve, reject) => {
      let isRepeat = false;
      if (this.props.books.length > 0) {
        this.props.books.forEach((item) => {
          if (item.md5 === md5 && item.size === file.size) {
            isRepeat = true;
            toast.error(this.props.t("Duplicate book"));
            return resolve();
          }
        });
      }
      if (this.props.deletedBooks.length > 0) {
        this.props.deletedBooks.forEach((item) => {
          if (item.md5 === md5 && item.size === file.size) {
            isRepeat = true;
            toast.error(this.props.t("Duplicate book in trash bin"));
            return resolve();
          }
        });
      }
      if (!isRepeat) {
        let reader = new FileReader();
        reader.readAsArrayBuffer(file);

        reader.onload = async (e) => {
          if (!e.target) {
            toast.error(this.props.t("Import failed"));
            return resolve();
          }
          let reader = new FileReader();
          reader.onload = async (event) => {
            const file_content = (event.target as any).result;
            try {
              result = await BookUtil.generateBook(
                bookName,
                extension,
                md5,
                file.size,
                file.path || clickFilePath,
                file_content
              );
            } catch (error) {
              console.log(error);
              throw error;
            }

            clickFilePath = "";
            if (result === "get_metadata_error") {
              toast.error(this.props.t("Import failed"));
              return resolve();
            }
            // 使用书籍的key和扩展名作为向量化文件的名称。key是1970年1月1日以来的毫秒数
            const vectorizedName = (result as BookModel).key + "." + extension;
            const isVectorized = await this.vectorizeFile(file_content, extension, vectorizedName);
            if (isVectorized) {
              await this.handleAddBook(
                result as BookModel,
                file_content as ArrayBuffer
              );
            }

            return resolve();
          };
          reader.readAsArrayBuffer(file);
        };
      }
    });
  };

  render() {
    return (
      <Dropzone
        onDrop={async (acceptedFiles) => {
          this.props.handleDrag(false);
          for (let item of acceptedFiles) {
            await this.getMd5WithBrowser(item);
          }
        }}
        accept={[
          ".epub",
          ".pdf",
          ".txt",
          ".mobi",
          ".azw3",
          ".azw",
          ".htm",
          ".html",
          ".xml",
          ".xhtml",
          ".mhtml",
          ".docx",
          ".md",
          ".fb2",
          ".cbz",
          ".cbt",
          ".cbr",
          ".cb7",
        ]}
        multiple={true}
      >
        {({ getRootProps, getInputProps }) => (
          <div
            className="import-from-local"
            {...getRootProps()}
            style={
              this.props.isCollapsed && document.body.clientWidth < 950
                ? { width: "42px" }
                : {}
            }
          >
            <div className="animation-mask-local"></div>
            {this.props.isCollapsed && this.state.width < 950 ? (
              <span
                className="icon-folder"
                style={{ fontSize: "15px", fontWeight: 500 }}
              ></span>
            ) : (
              <span>
                <Trans>Import</Trans>
              </span>
            )}

            <input
              type="file"
              id="import-book-box"
              className="import-book-box"
              name="file"
              {...getInputProps()}
            />
          </div>
        )}
      </Dropzone>
    );
  }
}

export default withRouter(ImportLocal as any);
